#!/usr/bin/env node
/**
 * 发版脚本：上传 APK → Storage → 写入 app_versions 表
 *
 * 用法：
 *   SUPABASE_SERVICE_KEY=<service_role_key> node scripts/upload-apk.js
 *
 * 或配合 npm version：
 *   npm version patch && npm run build:apk && SUPABASE_SERVICE_KEY=<key> node scripts/upload-apk.js
 */

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = 'https://agouobddgpkhipldgzhr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const APK_PATH = path.resolve(__dirname, '../frontend/android/app/build/outputs/apk/debug/app-debug.apk')
const PKG_PATH = path.resolve(__dirname, '../frontend/package.json')

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ 请设置环境变量 SUPABASE_SERVICE_KEY（Supabase Dashboard → Settings → API → service_role key）')
  process.exit(1)
}

async function main() {
  // 读取版本号
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'))

  // 读取 APK 文件
  if (!fs.existsSync(APK_PATH)) {
    console.error(`❌ APK 文件不存在: ${APK_PATH}`)
    console.error('   请先执行 npm run build:apk')
    process.exit(1)
  }
  const apkBuffer = fs.readFileSync(APK_PATH)
  const apkSize = (apkBuffer.length / (1024 * 1024)).toFixed(1)
  console.log(`📦 APK 大小: ${apkSize} MB (v${pkg.version})`)

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/octet-stream',
    'x-upsert': 'true',
  }

  // 1. 上传 APK 到 Storage
  console.log('⏳ 上传 APK 到 Storage...')
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/apk/fuel_records.apk`,
    { method: 'POST', headers, body: apkBuffer }
  )

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error('❌ 上传失败:', err)
    process.exit(1)
  }
  console.log('✅ 上传成功')

  // 2. 获取公开 URL
  const apkUrl = `${SUPABASE_URL}/storage/v1/object/public/apk/fuel_records.apk`
  console.log(`🔗 公开地址: ${apkUrl}`)

  // 3. 查询当前最大 version_code
  const readHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  }
  const queryRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_versions?select=version_code&order=version_code.desc&limit=1`,
    { headers: readHeaders }
  )

  let newCode = 1
  if (queryRes.ok) {
    const rows = await queryRes.json()
    if (rows && rows.length > 0) {
      newCode = rows[0].version_code + 1
    }
  }
  console.log(`🔢 新 version_code: ${newCode}`)

  // 4. INSERT 新版本记录
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

  console.log(`✅ v${pkg.version}（code ${newCode}）发布完成！`)
}

main().catch((err) => {
  console.error('❌ 发版失败:', err.message)
  process.exit(1)
})
