#!/usr/bin/env node
/**
 * 发版脚本：一键完成 版本号升级 → 构建 APK → 上传 Supabase
 *
 * 用法：
 *   export $(grep -v '^#' .env | xargs) && node scripts/upload-apk.js
 *
 * 流程：
 *   1. npm version patch → 升 package.json 版本号
 *   2. 从新的 version 字段自动计算 version_code（公式: MAJOR×10000 + MINOR×100 + PATCH）
 *   3. npm run build:apk → upgrade.ts 在构建时 import pkg.version 自动算出 code
 *   4. 上传 APK 到 Storage
 *   5. INSERT app_versions 表
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SUPABASE_URL = 'https://agouobddgpkhipldgzhr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const FRONTEND_DIR = path.resolve(__dirname, '../frontend')
const APK_PATH = path.resolve(FRONTEND_DIR, 'android/app/build/outputs/apk/debug/app-debug.apk')
const PKG_PATH = path.resolve(FRONTEND_DIR, 'package.json')

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ 请设置环境变量 SUPABASE_SERVICE_KEY')
  console.error('   export $(grep -v \'^#\' .env | xargs)')
  process.exit(1)
}

/** 与 upgrade.ts 保持一致的算法：MAJOR×10000 + MINOR×100 + PATCH */
function versionToCode(version) {
  const [major, minor, patch] = version.split('.').map(Number)
  return major * 10000 + minor * 100 + patch
}

async function main() {

  // 1. 升版本号
  console.log('📌 npm version patch...')
  execSync('npm version patch', { cwd: FRONTEND_DIR, stdio: 'inherit' })

  // 2. 读取新 version → 计算 version_code
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'))
  const newCode = versionToCode(pkg.version)
  console.log(`🔢 新 version_code: ${newCode} (from v${pkg.version})`)

  // 3. 构建 APK（upgrade.ts 会在构建时 import pkg.version，自动烘焙对应的 code）
  console.log('🔨 npm run build:apk...')
  execSync('npm run build:apk', { cwd: FRONTEND_DIR, stdio: 'inherit' })

  // 4. 上传 APK
  const apkBuffer = fs.readFileSync(APK_PATH)
  const apkSize = (apkBuffer.length / (1024 * 1024)).toFixed(1)
  console.log(`📦 APK: ${apkSize} MB (v${pkg.version}, code ${newCode})`)

  const uploadHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/octet-stream',
    'x-upsert': 'true',
  }

  console.log('⏳ 上传 APK 到 Storage...')
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/apk/fuel_records.apk`,
    { method: 'POST', headers: uploadHeaders, body: apkBuffer }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error('❌ 上传失败:', err)
    process.exit(1)
  }
  console.log('✅ 上传成功')

  // 6. 公开 URL
  const apkUrl = `${SUPABASE_URL}/storage/v1/object/public/apk/fuel_records.apk`
  console.log(`🔗 ${apkUrl}`)

  // 7. INSERT app_versions
  const insertHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
  const insertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_versions`,
    {
      method: 'POST',
      headers: insertHeaders,
      body: JSON.stringify({
        version_code: newCode,
        version_name: pkg.version,
        apk_url: apkUrl,
        release_notes: '',
      }),
    }
  )

  if (!insertRes.ok) {
    const err = await insertRes.text()
    console.error('❌ 写入 app_versions 失败:', err)
    process.exit(1)
  }

  console.log(`\n✅✅✅ v${pkg.version}（code ${newCode}）发布完成！`)
  console.log(`📱 APK: frontend/dist/fuel_records_v${pkg.version}.apk\n`)
}

main().catch((err) => {
  console.error('❌ 发版失败:', err.message)
  process.exit(1)
})
