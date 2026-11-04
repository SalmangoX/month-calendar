import java.util.Properties

plugins {
    id("com.android.application")
}

val ver = Properties().apply { rootProject.file("version.properties").inputStream().use { load(it) } }
// 版本号和网页共用仓库根目录的 version.json（例如 0.9.2），不再单独维护
val webVersion: String = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootProject.file("../version.json").takeIf { it.exists() }?.readText() ?: "")
    ?.groupValues?.get(1)?.replace(Regex("-b\\d+$"), "")
    ?: (ver.getProperty("versionName") ?: "0.0.0")
// 在 GitHub Actions 里编译时由工作流提供；在自己电脑上编译时用调试签名
val keystoreFile: String? = System.getenv("KEYSTORE_FILE")

android {
    namespace = "io.github.salmangox.monthcalendar"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.salmangox.monthcalendar"
        minSdk = 31
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = webVersion
        buildConfigField("String", "APP_URL", "\"${ver.getProperty("appUrl")}\"")
        buildConfigField("String", "REPO", "\"${ver.getProperty("repo")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            if (keystoreFile != null) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD") ?: System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystoreFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    // WebDAV（坚果云等）的 PROPFIND、MKCOL 请求：系统自带的 HttpURLConnection 不支持这两个方法
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // 分享到微信（好友 / 朋友圈，微信里显示「来自 节律」）
    implementation("com.tencent.mm.opensdk:wechat-sdk-android:6.8.0")
}
