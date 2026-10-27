import groovy.json.JsonSlurper
plugins { id("com.android.application") }
val runtime = JsonSlurper().parse(rootProject.file("runtime.json")) as Map<*, *>
android {
 namespace = "com.hetun.client"
 compileSdk = 36
 androidResources { noCompress += "mp4" }
 defaultConfig {
  applicationId = runtime["packageName"] as String
  testInstrumentationRunner = "com.hetun.client.OperationsTestRunner"
  minSdk = 26
  targetSdk = 36
  versionCode = (runtime["versionCode"] as Number).toInt()
  versionName = runtime["versionName"] as String
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 // Base APK compilation uses cached dependencies; release lint must run separately.
 lint { checkReleaseBuilds = false }
 buildTypes { getByName("release") { isMinifyEnabled = false } }
}
