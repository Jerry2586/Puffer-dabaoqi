import groovy.json.JsonSlurper
plugins { id("com.android.application") }
val runtime = JsonSlurper().parse(rootProject.file("runtime.json")) as Map<*, *>
android {
 namespace = "com.hetun.client"
 compileSdk = 36
 defaultConfig {
  applicationId = runtime["packageName"] as String
  minSdk = 26
  targetSdk = 36
  versionCode = (runtime["versionCode"] as Number).toInt()
  versionName = runtime["versionName"] as String
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 // Local offline demonstration: run full lint separately before formal release.
 lint { checkReleaseBuilds = false }
 buildTypes { getByName("release") { isMinifyEnabled = false } }
}
