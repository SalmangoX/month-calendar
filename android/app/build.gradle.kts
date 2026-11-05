import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
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
        compose = true
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
        debug {
            // 本机调试网页：APP_URL_DEBUG=http://10.0.2.2:8765/ ./gradlew assembleDebug（模拟器里 10.0.2.2 就是这台电脑）
            System.getenv("APP_URL_DEBUG")?.let { buildConfigField("String", "APP_URL", "\"$it\"") }
        }
        release {
            isMinifyEnabled = false
            signingConfig = if (keystoreFile != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
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

    // 原生悬浮控件（叠在网页上面的时钟胶囊 · 分页点 · logo 扇形）：Jetpack Compose
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    // 网页一开始就注入脚本（藏起网页自己的悬浮控件，换成原生的）
    implementation("androidx.webkit:webkit:1.12.1")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // 合并规则的对照测试（JVM 上没有安卓自带的 org.json）
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
