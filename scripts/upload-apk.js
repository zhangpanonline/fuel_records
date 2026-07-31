#!/usr/bin/env node
/**
 * 发版脚本：一键完成 版本号升级 → 构建 APK → 上传 Supabase
 *
 * 用法：
 *   export $(grep -v '^#' .env | xargs) && node scripts/upload-apk.js
 *
 * 流程：
 *   1. 查询 Supabase → 得到新 version_code
 *   2. 更新 upgrade.ts CURRENT_VERSION_CODE（先改，再构建）
 *   3. npm version patch → 升 package.json 版本号
 *   4. npm run build:apk → 此时 APK 内烘焙的 code 是正确的
 *   5. 上传 APK 到 Storage
 *   6. INSERT app_versions 表
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SUPABASE_URL = 'https://agouobddgpkhipldgzhr.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const FRONTEND_DIR = path.resolve(__dirname, '../frontend')
const APK_PATH = path.resolve(FRONTEND_DIR, 'android/app/build/outputs/apk/debug/app-debug.apk')
const PKG_PATH = path.resolve(FRONTEND_DIR, 'package.json')
const UPGRADE_PATH = path.resolve(FRONTEND_DIR, 'src/services/upgrade.ts')

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ 请设置环境变量 SUPABASE_SERVICE_KEY')
  console.error('   export $(grep -v \'^#\' .env | xargs)')
  process.exit(1)
}

async function main() {
  const readHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  }

  // 1. 查询当前最大 version_code → 得到新 code
  console.log('🔍 查询 Supabase 最新版本...')
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

  // 2. 先更新 upgrade.ts 的 CURRENT_VERSION_CODE（再构建 APK 会把正确值烘焙进去）
  let upgradeContent = fs.readFileSync(UPGRADE_PATH, 'utf-8')
  const oldCode = upgradeContent.match(/const CURRENT_VERSION_CODE = (\d+)/)?.[1]
  upgradeContent = upgradeContent.replace(
    /const CURRENT_VERSION_CODE = \d+/,
    `const CURRENT_VERSION_CODE = ${newCode}`
  )
  fs.writeFileSync(UPGRADE_PATH, upgradeContent, 'utf-8')
  console.log(`🔄 upgrade.ts → CURRENT_VERSION_CODE: ${oldCode} → ${newCode}`)

  // 3. 升版本号
  console.log('📌 npm version patch...')
  execSync('npm version patch', { cwd: FRONTEND_DIR, stdio: 'inherit' })

  // 4. 构建 APK（此时 CURRENT_VERSION_CODE 正确）
  console.log('🔨 npm run build:apk...')
  execSync('npm run build:apk', { cwd: FRONTEND_DIR, stdio: 'inherit' })

  // 5. 读取 APK 并上传
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'))
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
