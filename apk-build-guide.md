## 目录

1. [前置环境要求](#1-前置环境要求)
2. [安装 Capacitor 依赖](#2-安装-capacitor-依赖)
3. [配置生产环境 API 地址](#3-配置生产环境-api-地址)
4. [构建前端 Web 资源](#4-构建前端-web-资源)
5. [初始化 Capacitor 并添加 Android 平台](#5-初始化-capacitor-并添加-android-平台)
6. [常见构建问题及修复](#6-常见构建问题及修复)
7. [编译 APK](#7-编译-apk)
8. [APK 传到手机安装](#8-apk-传到手机安装)
9. [后续更新重新打包](#9-后续更新重新打包)

---

## 1. 前置环境要求

打包 APK 需要以下环境，缺一不可：

| 工具 | 用途 | 如何安装 / 检查 |
|------|------|----------------|
| **Node.js + npm** | 构建前端 | 已安装（Vite 项目需要） |
| **Java JDK** | Gradle 编译需要 | Android Studio 自带 JDK 21（路径：`/Applications/Android Studio.app/Contents/jbr/Contents/Home`） |
| **Android Studio** | 提供 Android SDK | [developer.android.com/studio](https://developer.android.com/studio) |
| **Android SDK** | 编译 Android 原生代码 | Android Studio → SDK Manager 安装 |
| **Gradle** | Android 构建工具 | 无需单独安装，项目自带 Gradle Wrapper |

### 1.1 检查环境

```bash
# 检查 Java
java -version
# 应输出 JDK 21 或 17（JDK 24 会与 Gradle 8.11 不兼容）

# 检查 ANDROID_HOME
ls ~/Library/Android/sdk
# 应有 build-tools/、platforms/ 等目录

# 检查 Android SDK 组件
ls ~/Library/Android/sdk/platforms/     # 应有 android-35
ls ~/Library/Android/sdk/build-tools/   # 应有 34.0.0
```

### 1.2 如果 JDK 版本过高（如 JDK 24）

JDK 24 与 Gradle 8.11.1 不兼容，会报 `Unsupported class file major version 68`。解决方式——使用 Android Studio 自带的 JDK 21：

```bash
export JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home
```

### 1.3 如果缺少 SDK 组件

```bash
export ANDROID_HOME=~/Library/Android/sdk

# 安装缺失的组件
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35"
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "build-tools;34.0.0"
```

---

## 2. 安装 Capacitor 依赖

在 `frontend/` 目录下运行：

```bash
cd /Users/zp/Code/fuel_records/frontend
npm install @capacitor/core @capacitor/cli @capacitor/android
```

安装后 `package.json` 会新增三个依赖。

---

## 3. 配置生产环境 API 地址

开发时通过 Vite 代理连接本地 `localhost:8000`，但 APK 运行在手机上无法访问 localhost，必须指向线上 Render 服务器。

创建 `frontend/.env.production`：

```env
# APK 打包时使用 Render 线上 API，不使用 Vite 代理
VITE_API_BASE_URL=https://fuel-records.onrender.com
```

> **原理**：Vite 在 `npm run build`（生产构建）时自动读取 `.env.production`，将 `VITE_API_BASE_URL` 注入到 JS 代码中。`api.ts` 里的 `baseURL: import.meta.env.VITE_API_BASE_URL || ''` 会拿到这个值。

---

## 4. 构建前端 Web 资源

```bash
cd /Users/zp/Code/fuel_records/frontend
npm run build
```

这会：
- TypeScript 类型检查 + 编译（`tsc -b`）
- Vite 打包生产版本到 `dist/` 目录

成功后输出类似：

```
dist/index.html                   0.45 kB
dist/assets/index-xxxxx.css       1.93 kB
dist/assets/index-xxxxx.js      239.35 kB
```

> 构建前请确保 `src/services/api.ts` 类型转换正确（`res.data as unknown as Record<string, unknown>`），否则 TypeScript 编译会报错。

---

## 5. 初始化 Capacitor 并添加 Android 平台

### 5.1 初始化

```bash
cd /Users/zp/Code/fuel_records/frontend
npx cap init "Fuel Records" "com.fuelrecords.app" --web-dir=dist
```

- `"Fuel Records"` — App 名称
- `"com.fuelrecords.app"` — App ID（Android 包名，全局唯一）
- `--web-dir=dist` — Web 资源目录（Vite 构建输出目录）

### 5.2 添加 Android 平台

```bash
npx cap add android
```

这会：
- 在 `frontend/android/` 生成原生 Android 项目
- 将 `dist/` 中的 Web 资源复制到 `android/app/src/main/assets/public/`
- 配置 Gradle 构建脚本

---

## 6. 常见构建问题及修复

### 6.1 Gradle 下载超时（国内网络）

`gradle-wrapper.properties` 默认从 `services.gradle.org` 下载，国内可能超时。

**修复**：编辑 `android/gradle/wrapper/gradle-wrapper.properties`：

```properties
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-all.zip
networkTimeout=60000
validateDistributionUrl=false
```

### 6.2 JDK 版本不兼容

报错 `Unsupported class file major version 68` 表示 JDK 版本过高。

**修复**：使用 Android Studio 自带的 JDK 21：

```bash
export JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home
```

### 6.3 Android SDK 目录不可写 / 缺少组件

```
Failed to install the following SDK components:
  platforms;android-35 Android SDK Platform 35
  build-tools;34.0.0 Android SDK Build-Tools 34
```

**修复**：手动安装缺失组件（见 1.3 节），然后确保 `local.properties` 正确：

```bash
echo "sdk.dir=/Users/zp/Library/Android/sdk" > android/local.properties
```

### 6.4 Kotlin stdlib 重复类冲突

```
Duplicate class kotlin.xxx found in modules
  kotlin-stdlib-1.8.22.jar and kotlin-stdlib-jdk8-1.6.21.jar
```

**修复**：编辑 `android/build.gradle`，在末尾添加：

```gradle
subprojects {
    afterEvaluate {
        configurations.all {
            exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk8'
            exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk7'
        }
    }
}
```

---

## 7. 编译 APK

### 7.1 设置环境变量后编译

```bash
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home
cd /Users/zp/Code/fuel_records/frontend/android

# 先清理旧构建产物，再编译 debug 版本
./gradlew clean assembleDebug
```

### 7.2 找到生成的 APK

```bash
ls -lh app/build/outputs/apk/debug/app-debug.apk
```

输出类似：

```
-rw-r--r--  4.1M  app-debug.apk
```

### 7.3 构建 Release 版本（可选）

Release 版本需要签名才能安装，通常用 Android Studio → Build → Generate Signed Bundle / APK 来操作，这里不展开。

---

## 8. APK 传到手机安装

### 方式一：USB 数据线 + adb

```bash
# 手机开启 USB 调试，连接电脑
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 方式二：隔空投送 / 微信 / QQ

将 APK 文件发送到手机，在手机上点击安装。首次安装需要允许"未知来源"安装。

### 方式三：本地 HTTP 服务器

```bash
cd app/build/outputs/apk/debug
python3 -m http.server 9999
# 手机浏览器访问 http://<电脑IP>:9999/app-debug.apk 下载安装
```

---

## 9. 后续更新重新打包

每次修改前端代码后，重新打包只需三步：

```bash
# 1. 重新构建前端
cd /Users/zp/Code/fuel_records/frontend
npm run build

# 2. 同步 Web 资源到 Android 项目
npx cap sync

# 3. 重新编译 APK
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home
cd android && ./gradlew assembleDebug
```

---

## 速查：完整打包命令链

```bash
# 进入项目
cd /Users/zp/Code/fuel_records/frontend

# 构建前端
npm run build

# （仅首次）安装 Capacitor + 初始化
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Fuel Records" "com.fuelrecords.app" --web-dir=dist
npx cap add android

# 同步并编译
npx cap sync
export ANDROID_HOME=~/Library/Android/sdk
export JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home
cd android && ./gradlew clean assembleDebug
```
