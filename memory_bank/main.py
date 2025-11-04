import json
import numpy as np
import heapq
from openai import OpenAI
from fastapi import FastAPI
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager
import os

OPENAI_CLIENT = OpenAI(
    api_key="EMPTY",
    base_url=f"http://127.0.0.1:9002/v1",
)
MEMORY_BANK: list[dict[str,]] = []
EMBEDDINGS: list[list[float]] = []
MEMORY_BANK_FILE = "memory_bank.json"


def batch_cosine_similarity(
    query: list[float], documents: list[list[float]]
) -> list[float]:
    """
    使用NumPy高效批量计算余弦相似度

    Args:
        query: 查询向量
        documents: 文档向量列表

    Returns:
        相似度列表
    """
    # 转换为numpy数组
    query_arr = np.array(query)
    docs_arr = np.array(documents)  # shape: (n_docs, embedding_dim)

    # 向量化计算点积：docs_arr @ query_arr 得到所有文档与query的点积
    dot_products = docs_arr @ query_arr  # shape: (n_docs,)

    # 计算范数
    query_norm = np.linalg.norm(query_arr)
    docs_norms = np.linalg.norm(docs_arr, axis=1)  # shape: (n_docs,)

    # 计算余弦相似度
    similarities = dot_products / (query_norm * docs_norms)

    # 转换回Python list
    return similarities.tolist()


def remember(content: str) -> None:
    """
    记住一条记忆
    """
    d = {"content": content, "embedding": get_embedding(content)}
    MEMORY_BANK.append(d)
    EMBEDDINGS.append(d["embedding"])


def get_embedding(text: str) -> list[float]:
    """
    获取文本的嵌入向量
    """
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": text},
            ],
        }
    ]
    response = OPENAI_CLIENT.chat.completions.create(
        model="Qwen3-Embedding-0.6B",
        messages=messages,
        temperature=0.0,
    )
    emb = response.data[0]["embedding"]
    emb = emb / np.linalg.norm(emb)  # 归一化
    return emb.tolist()


def search(query: str, top_k: int = 5) -> list[str] | None:
    """
    根据查询字符串搜索记忆
    """
    if not MEMORY_BANK:
        return []
    
    # 计算查询向量的嵌入
    query_embedding = get_embedding(query)

    # 计算所有记忆与查询的相似度
    sims = batch_cosine_similarity(query_embedding, EMBEDDINGS)

    # 使用heapq.nlargest只选出top_k，时间复杂度O(n log k)
    top_k_indices = heapq.nlargest(top_k, range(len(sims)), key=lambda i: sims[i])

    # 返回top_k条记忆
    return [MEMORY_BANK[i]["content"] for i in top_k_indices]


def reload_memory() -> None:
    """
    加载记忆
    """
    global MEMORY_BANK, EMBEDDINGS
    if os.path.exists(MEMORY_BANK_FILE):
        with open(MEMORY_BANK_FILE, "r", encoding="utf-8") as f:
            MEMORY_BANK = json.load(f)
        EMBEDDINGS = [d["embedding"] for d in MEMORY_BANK]
        print(f"已加载 {len(MEMORY_BANK)} 条记忆")
    else:
        MEMORY_BANK = []
        EMBEDDINGS = []
        print("记忆文件不存在，初始化空记忆库")


def save_memory() -> None:
    """
    保存记忆
    """
    with open(MEMORY_BANK_FILE, "w", encoding="utf-8") as f:
        json.dump(MEMORY_BANK, f, ensure_ascii=False, indent=2)
    print(f"已保存 {len(MEMORY_BANK)} 条记忆")


# FastAPI 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时加载记忆
    print("正在启动服务...")
    reload_memory()
    yield
    # 关闭时保存记忆
    print("正在关闭服务...")
    save_memory()


# 创建 FastAPI 应用
app = FastAPI(title="记忆管理系统", lifespan=lifespan)


# Pydantic 模型
class RememberRequest(BaseModel):
    content: str


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=5, ge=1)


class MemoryResponse(BaseModel):
    memory: list[str]


# API 端点
@app.post("/remember")
async def api_remember(request: RememberRequest):
    """
    记住一条记忆
    """
    remember(request.content)
    return {"status": "success", "message": "记忆已保存"}


@app.post("/search", response_model=MemoryResponse)
async def api_search(request: SearchRequest):
    """
    搜索记忆
    """
    results = search(request.query, request.top_k)
    return {"memory": results}


@app.get("/")
async def root():
    """
    根路径
    """
    return {
        "message": "记忆管理系统",
        "endpoints": {
            "POST /remember": "添加记忆",
            "POST /search": "搜索记忆",
        },
        "memory_count": len(MEMORY_BANK),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=9003)
