# Docker 常用命令速查

> 本项目使用的 Docker + docker-compose 知识速查表。

---

## 一、Dockerfile 常用指令

| 指令 | 用途 | 示例 |
|------|------|------|
| `FROM` | 选基础镜像 | `FROM python:3.12-slim` |
| `WORKDIR` | 设置容器内工作目录 | `WORKDIR /app` |
| `COPY` | 复制文件进容器 | `COPY requirements.txt .` |
| `RUN` | 构建时执行命令（装依赖等） | `RUN pip install -r requirements.txt` |
| `EXPOSE` | 声明容器监听端口（文档作用） | `EXPOSE 8000` |
| `CMD` | 容器启动时运行的命令 | `CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]` |
| `ENV` | 设置环境变量 | `ENV APP_DEBUG=false` |
| `ARG` | 构建参数（构建时可覆盖） | `ARG VERSION=1.0` |

### 构建缓存优化技巧

```
COPY requirements.txt .   ← 先拷依赖文件
RUN pip install ...       ← 再装依赖（requirements.txt 没变就用缓存）
COPY . .                  ← 最后拷代码
```

---

## 二、docker-compose.yml 常用关键字

| 关键字 | 用途 | 示例 |
|--------|------|------|
| `services` | 定义有哪些服务 | `services: db: app:` |
| `image` | 使用官方镜像 | `image: mysql:8.0` |
| `build` | 用 Dockerfile 构建 | `build: context: ./backend dockerfile: Dockerfile` |
| `environment` | 环境变量 | `environment: DB_TYPE: mysql` |
| `ports` | 端口映射（宿主机:容器） | `ports: - "8000:8000"` |
| `volumes` | 数据持久化 | `volumes: - mysql_data:/var/lib/mysql` |
| `depends_on` | 启动顺序控制 | `depends_on: db: condition: service_healthy` |
| `healthcheck` | 检查服务是否就绪 | `healthcheck: test: ["CMD", "mysqladmin", "ping"]` |
| `container_name` | 给容器取名字 | `container_name: fuel_records_db` |
| `restart` | 失败后自动重启 | `restart: unless-stopped` |

### 常用命令

```bash
# 启动所有服务（后台运行）
docker-compose up -d

# 停止并删除所有容器
docker-compose down

# 查看日志（实时跟踪）
docker-compose logs -f

# 查看日志（只查 app 服务的）
docker-compose logs -f app

# 重启服务
docker-compose restart

# 重新构建并启动（代码变更后）
docker-compose up -d --build
```

---

## 三、docker 常用命令

```bash
# 查看所有容器
docker ps -a

# 查看正在运行的容器
docker ps

# 查看镜像列表
docker images

# 拉取镜像
docker pull mysql:8.0

# 进入容器内部
docker exec -it 容器名 bash

# 查看容器日志
docker logs 容器名

# 停止容器
docker stop 容器名

# 删除容器
docker rm 容器名

# 删除镜像
docker rmi 镜像名:标签
```

### Docker Desktop 配置镜像加速（国内必配）

Settings → Docker Engine，修改 JSON：

```json
{
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false,
  "registry-mirrors": [
    "https://docker.xuanyuan.me",
    "https://docker.1ms.run",
    "https://docker.m.daocloud.io"
  ]
}
```

点 **Apply & Restart** 生效。
