## 🚀 一键发版

```bash
./build_apk.sh
```

自动完成：检查 JDK 21 → 加载 .env → 升版本号 → 构建 Release APK（签名） → 上传 Storage → INSERT 表

> 等价于手动执行：
> ```bash
> export JAVA_HOME=$(/usr/libexec/java_home -v 21)
> export $(grep -v '^#' .env | xargs)
> node scripts/upload-apk.js
> ```

---

## 目录

1. [前置环境要求](#1-前置环境要求)
2. [一键打包（推荐）](#2-一键打包推荐)
3. [安装 Capacitor 依赖（仅首次）](#3-安装-capacitor-依赖仅首次)
4. [配置生产环境 API 地址](#4-配置生产环境-api-地址)
5. [初始化 Capacitor 并添加 Android 平台（仅首次）](#5-初始化-capacitor-并添加-android-平台仅首次)
6. [配署 Release 签名（仅首次）](#9-配置-release-签名仅首次)
7. [常见构建问题及修复](#6-常见构建问题及修复)
8. [APK 传到手机安装](#7-apk-传到手机安装)
9. [发版上传到 Supabase](#8-发版上传到-supabase)

---

## 1. 前置环境要求

打包 APK 需要以下环境，缺一不可：

| 工具 | 用途 | 如何安装 / 检查 |
|------|------|----------------|
| **Node.js + npm** | 构建前端 | 已安装（Vite 项目需要） |
| **Java JDK 21** | Gradle 编译需要 | Amazon Corretto 21，路径：`$(/usr/libexec/java_home -v 21)` |
| **Android Studio** | 提供 Android SDK | [developer.android.com/studio](https://developer.android.com/studio) |
| **Android SDK** | 编译 Android 原生代码 | Android Studio → SDK Manager 安装 |
| **Gradle** | Android 构建工具 | 无需单独安装，项目自带 Gradle Wrapper |

### 1.1 检查环境

```bash
# 检查 Java（必须是 21）
java -version
# 应输出 JDK 21

# 检查 ANDROID_HOME
ls ~/Library/Android/sdk
# 应有 build-tools/、platforms/ 等目录

# 检查 Android SDK 组件
ls ~/Library/Android/sdk/platforms/     # 应有 android-35
ls ~/Library/Android/sdk/build-tools/   # 应有 34.0.0
```

### 1.2 如果没有 JDK 21

本项目使用 Amazon Corretto JDK 21（`~/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk`）。

```bash
# 设置 JAVA_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

### 1.3 如果缺少 SDK 组件

```bash
export ANDROID_HOME=~/Library/Android/sdk

# 安装缺失的组件
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35"
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "build-tools;34.0.0"
```

---

## 2. 一键打包（推荐）

```bash
cd /Users/zp/Code/fuel_records/frontend
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
npm run build:apk
```

这条命令自动执行：Vite 构建 → cap sync → Gradle 编译（`assembleRelease`，已签名） → 输出到 `dist/fuel_records_vX.X.X.apk`

**产物位置**：
```
frontend/dist/fuel_records_v1.0.26.apk   ← 已签名的正式版 APK，直接发这个文件给手机安装
frontend/android/app/build/outputs/apk/release/app-release.apk   ← Gradle 原始产物（已签名）
```

---

## 3. 安装 Capacitor 依赖（仅首次）

在 `frontend/` 目录下运行：

```bash
cd /Users/zp/Code/fuel_records/frontend
npm install @capacitor/core @capacitor/cli @capacitor/android
```

安装后 `package.json` 会新增三个依赖。

---

## 4. 配置生产环境 API 地址

开发时通过 Vite 代理连接本地 `localhost:8000`，但 APK 运行在手机上无法访问 localhost，必须指向线上 Render 服务器。

创建 `frontend/.env.production`：

```env
# APK 打包时使用 Render 线上 API，不使用 Vite 代理
VITE_API_BASE_URL=https://fuel-records.onrender.com
```

> **原理**：Vite 在 `npm run build`（生产构建）时自动读取 `.env.production`，将 `VITE_API_BASE_URL` 注入到 JS 代码中。`api.ts` 里的 `baseURL: import.meta.env.VITE_API_BASE_URL || ''` 会拿到这个值。

---

## 5. 初始化 Capacitor 并添加 Android 平台（仅首次）

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

## 6. 配置 Release 签名（仅首次）

本项目构建的是 **正式版 Release APK**，需要签名密钥。所有签名相关文件统一放在 `secrets/` 目录下。

### 6.1 密钥文件位置

```
fuel_records/
├── secrets/
│   ├── fuel_records.keystore    # RSA 2048 签名密钥（.gitignore 已排除）
│   └── keystore.properties      # 密码配置（.gitignore 已排除）
└── frontend/android/app/
    └── build.gradle         # 读取 secrets/keystore.properties 并配置 signingConfigs.release
```

### 6.2 首次配置（生成密钥）

如果 `fuel_records.keystore` 不存在，执行以下命令生成：

```bash
cd /Users/zp/Code/fuel_records/secrets
keytool -genkey -v \
  -keystore fuel_records.keystore \
  -alias fuel_records \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass fuelrecords123 \
  -keypass fuelrecords123 \
  -dname "CN=Fuel Records, OU=Dev, O=FuelRecords, L=Unknown, ST=Unknown, C=CN"
```

然后创建 `secrets/keystore.properties`：

```properties
KEYSTORE_PATH=secrets/fuel_records.keystore
KEYSTORE_PASSWORD=fuelrecords123
KEY_ALIAS=fuel_records
KEY_PASSWORD=fuelrecords123
```

> **注意**：`.gitignore` 已配置 `secrets/` 目录排除，不会被提交到仓库。换电脑/重装系统前请备份整个 `secrets/` 目录。

### 6.3 签名原理

`app/build.gradle` 构建时自动读取 `secrets/keystore.properties`，配置 `signingConfigs.release`：

```groovy
signingConfigs {
    release {
        storeFile file("${rootProject.projectDir}/../../${keystoreProps['KEYSTORE_PATH']}")
        storePassword keystoreProps['KEYSTORE_PASSWORD']
        keyAlias keystoreProps['KEY_ALIAS']
        keyPassword keystoreProps['KEY_PASSWORD']
    }
}
```

### 6.4 版本号同步机制

`versionCode` 和 `versionName` 不再写死在 `build.gradle`，而是由 `upload-apk.js` 在构建前动态写入 `frontend/android/version.properties`：

```
# upload-apk.js 自动生成，每次构建前覆盖
versionCode=10026
versionName=1.0.26
```

Gradle 读取该文件作为 `defaultConfig` 的版本号，确保 APK 内烙的版本号与 Supabase 记录完全一致。

---

## 7. 常见构建问题及修复

### 7.1 Gradle 下载超时（国内网络）

`gradle-wrapper.properties` 默认从 `services.gradle.org` 下载，国内可能超时。

**修复**：编辑 `android/gradle/wrapper/gradle-wrapper.properties`：

```properties
distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-all.zip
networkTimeout=60000
validateDistributionUrl=false
```

### 7.2 JDK 版本不兼容

报错 `Unsupported class file major version 68` 表示 JDK 版本过高（不是 21）。

**修复**：设置项目使用的 Corretto JDK 21：

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

### 7.3 Android SDK 目录不可写 / 缺少组件

```
Failed to install the following SDK components:
  platforms;android-35 Android SDK Platform 35
  build-tools;34.0.0 Android SDK Build-Tools 34
```

**修复**：手动安装缺失组件（见 1.3 节），然后确保 `local.properties` 正确：

```bash
echo "sdk.dir=/Users/zp/Library/Android/sdk" > android/local.properties
```

### 7.4 Kotlin stdlib 重复类冲突

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

### 7.5 APK 安装后打开空白页

**原因**：`capacitor.config.ts` 中 `server.url` 指向了开发机 IP，手机上连不到。

**修复**：打包 APK 前确保 `capacitor.config.ts` 中**没有 `server` 块**，这样 App 会从内置 `dist/` 加载资源。`build_apk.sh` 脚本已内置此检查。

### 7.6 Kotlin 编译 daemon 权限错误

```
e: java.nio.file.FileSystemException: kotlin-daemon-client-tsmarker...tmp: Operation not permitted
Could not connect to Kotlin compile daemon
```

这是 macOS 沙箱权限导致 Kotlin daemon 无法启动的已知问题。Gradle 会自动降级为 fallback 模式编译，不影响最终构建结果。忽略此警告即可。

如果每次都想消除此警告，可以停用 Kotlin daemon：

```bash
# 在 frontend/android/gradle.properties 中添加
kotlin.compiler.execution.strategy=in-process
```

---

## 8. APK 传到手机安装

APK 路径：`frontend/dist/fuel_records_vX.X.X.apk`

### 方式一：USB 数据线 + adb

```bash
adb install frontend/dist/fuel_records_v0.0.1.apk
```

### 方式二：隔空投送 / 微信 / QQ

将 `dist/fuel_records_vX.X.X.apk` 发送到手机，在手机上点击安装。首次安装需要允许"未知来源"安装。

---

## 9. 发版上传到 Supabase

**一键完成**：升版本号 → 写 version.properties → 构建 Release APK（签名） → 上传 Storage → INSERT 表：

```bash
cd /Users/zp/Code/fuel_records
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export $(grep -v '^#' .env | xargs)
node scripts/upload-apk.js
```

脚本自动完成（6 步按正确顺序）：

1. `npm version patch` → 升 `package.json` 版本号
2. 从新 version 计算 `version_code`（公式: MAJOR×10000 + MINOR×100 + PATCH）
3. 写入 `frontend/android/version.properties`（Gradle 读取作为 versionCode/versionName）
4. `npm run build:apk` → Vite 构建 → `assembleRelease`（读取 keystore 签名）
5. 上传 APK 到 Supabase Storage
6. INSERT 记录到 `app_versions` 表

### 版本检测流程

```
用户打开 App
  → upgrade.ts: checkUpdate()
    → 读取 package.json version → 自动计算 CURRENT_VERSION_CODE
    → fetch Supabase app_versions（匿名，RLS 允许）
      → 对比 CURRENT_VERSION_CODE vs 最新 version_code
        ├ 更大 → 弹"发现新版本"弹窗
        └ 相等 → 静默跳过
```

### Supabase 基础设施清单

| 组件 | 位置 | 说明 |
|------|------|------|
| `app_versions` 表 | Supabase → Table Editor | 版本记录（version_code, version_name, apk_url） |
| RLS 策略 | `anon can read app_versions` | 允许 App 匿名读 |
| Storage bucket `apk` | Supabase → Storage | public 公开 bucket |
| Data API | Settings → API | **必须开启**，否则 503 |
