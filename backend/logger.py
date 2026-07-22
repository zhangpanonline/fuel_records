"""日志配置：使用 loguru"""

import sys
from pathlib import Path

from loguru import logger

from config import settings


def setup_logger():
    """配置 loguru 日志"""
    # 把这个字符串变成一个路径对象。
    log_path = Path(settings.LOG_FILE)
    # log_path.parent 得到 logs/ ——也就是 "父目录"。
    # log_path.parent.mkdir(parents=True, exist_ok=True) 意思是：
    # - 创建 logs/ 这个目录
    # - parents=True ：如果父目录也不存在，一起创建
    # - exist_ok=True ：如果目录已经存在，不报错
    log_path.parent.mkdir(parents=True, exist_ok=True)

    # loguru 在被 import 的时候， 默认自带了一个 handler （会把日志输出到控制台）。但我们想自己控制输出格式，所以先用 remove() 把这个默认的删掉，后面再重新添加我们自己的。
    logger.remove()

    # 控制台输出（彩色）
    # logger.add() 是 loguru 的核心方法，意思是 "加一个日志输出的地方" 。
    logger.add(
        sys.stdout, # 输出到哪里 → 控制台
        level=settings.LOG_LEVEL, # 只输出 DEBUG 及以上级别的日志
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>",
        colorize=True, # 控制台里带颜色
    )

    # 文件输出（JSON 格式，方便后期日志分析）
    logger.add(
        settings.LOG_FILE,
        level=settings.LOG_LEVEL,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        rotation="10 MB",  # 每 10MB 轮转一个文件
        retention="30 days",  # 保留 30 天
        compression="gz",  # 旧日志压缩
        enqueue=True,  # 线程安全
    )

    logger.info("日志系统初始化完成，日志文件: {}", settings.LOG_FILE)
    return logger
