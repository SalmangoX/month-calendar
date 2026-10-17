import java.util.Properties

plugins {
    id("com.android.application")
}

val ver = Properties().apply { rootProject.file("version.properties").inputStream().use { load(it) } }
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
        versionName = ver.getProperty("versionName")
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
