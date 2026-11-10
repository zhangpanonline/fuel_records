package com.fuelrecords.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
        // 文档页以跨站 iframe 加载 doc.zhangpan.online，站点已开启全站密码门
        // （2026-11-10 起 iframe 也要求密码）。Android WebView 默认禁用第三方
        // cookie，不开此项则 iframe 里输入密码后 cookie 存不住，每次都弹密码页。
        CookieManager.getInstance()
            .setAcceptThirdPartyCookies(getBridge().getWebView(), true);
    }
}
