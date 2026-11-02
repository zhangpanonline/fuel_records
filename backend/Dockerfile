FROM python:3.12-slim

WORKDIR /app

# cryptography（PyMySQL 依赖）需要编译工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 单独复制 requirements.txt：依赖未变更时该层可命中构建缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# PORT 由 Fly.io 动态分配，本地未设置时回退 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
