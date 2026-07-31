plugins {
    id("com.android.application")
}

android {
    namespace = "com.junaid.chess"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.junaid.chess"
        minSdk = 24            // Android 7.0 and up
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            // signed with the debug key so the release APK is sideloadable too
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
