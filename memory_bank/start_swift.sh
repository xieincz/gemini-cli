#!/bin/zsh

# 设置工作目录
WORK_DIR=~/code/gemini-cli/memory_bank
SESSION_NAME="swift"

# 如果session已存在，先kill掉
tmux has-session -t $SESSION_NAME 2>/dev/null
if [ $? -eq 0 ]; then
    echo "Killing existing tmux session: $SESSION_NAME"
    tmux kill-session -t $SESSION_NAME
    sleep 1
fi

# 创建新的tmux session，第一个窗口命名为llm，直接设置工作目录
echo "Creating new tmux session: $SESSION_NAME"
tmux new-session -d -s $SESSION_NAME -n llm -c $WORK_DIR

# 在llm窗口中执行命令 - 使用python -m方式调用swift避免与系统Swift冲突
tmux send-keys -t ${SESSION_NAME}:0 "conda activate memory_bank && python -m swift.cli.deploy --model Qwen/Qwen3-0.6B --infer_backend vllm --vllm_max_model_len 8192 --vllm_gpu_memory_utilization 0.2 --host \"127.0.0.1\" --port 9001" C-m

# 创建第二个窗口embedding，直接设置工作目录
tmux new-window -t $SESSION_NAME -n embedding -c $WORK_DIR

# 在embedding窗口中执行命令 - 使用python -m方式调用swift避免与系统Swift冲突
tmux send-keys -t ${SESSION_NAME}:1 "conda activate memory_bank && python -m swift.cli.deploy --model Qwen/Qwen3-Embedding-0.6B --infer_backend vllm --vllm_max_model_len 8192 --vllm_gpu_memory_utilization 0.2 --host \"127.0.0.1\" --port 9002 --task_type embedding" C-m

# 创建第3个窗口memory_bank，直接设置工作目录
tmux new-window -t $SESSION_NAME -n memory_bank -c $WORK_DIR

# 在memory_bank窗口中执行命令
tmux send-keys -t ${SESSION_NAME}:2 "conda activate memory_bank && python main.py" C-m



# 切换到llm窗口
# tmux select-window -t ${SESSION_NAME}:0

echo "Tmux session '$SESSION_NAME' created with windows 'llm', 'embedding' and 'memory_bank'"
echo "To attach: tmux attach -t $SESSION_NAME"
echo "To switch windows: Ctrl+b then n (next) or p (previous)"
echo "To detach: Ctrl+b then d"
