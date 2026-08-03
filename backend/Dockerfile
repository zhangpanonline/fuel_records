# 1. 基础镜像：一个极简的 Python 3.12 环境
# slim 版本去掉了不需要的工具链，镜像体积更小
FROM python:3.12-slim

# 2. 设置工作目录
# 容器里会创建 /app 目录，后面的所有命令都在这个目录下执行
WORKDIR /app

# 3. 安装系统依赖
# PyMySQL 连接 MySQL 需要 cryptography，cryptography 需要编译依赖
# --no-cache-dir: 不缓存包文件，减少镜像体积
# 这里把 RUN 合并成一行，是 Docker 的最佳实践——减少镜像层数
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 4. 复制依赖文件并安装 Python 包
# 先复制 requirements.txt，再 pip install
# ★ 为什么要先复制 requirements.txt 而不是直接把整个项目复制进去？
#    因为 Docker 构建时，每一行命令是一个"层"（layer）。如果 requirements.txt 没变，
#    这一层就可以用缓存，不用每次重新 pip install。先拷 requirements.txt 再安装，
#    能大幅加快后续构建速度。
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. 复制项目代码
# . 表示把当前目录（backend/）下的所有文件复制到容器的 /app 下
COPY . .

# 6. 暴露端口
# 这只是"文档声明"，告诉使用者这个容器会监听 8000 端口
EXPOSE 8000

# 7. 启动命令
# 用 uvicorn 启动 FastAPI 应用
# --host 0.0.0.0 让容器内监听所有 IP（容器内部默认只有 127.0.0.1）
# $PORT 由 Fly.io 动态分配（本地未设置时回退 8000）
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
