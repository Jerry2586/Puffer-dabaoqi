package com.hetun.client

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.app.AlertDialog
import java.security.MessageDigest
import android.graphics.Color
import android.graphics.BitmapFactory
import android.widget.*
import android.view.View
import android.net.Uri
import android.content.Intent
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import java.net.HttpURLConnection
import java.util.concurrent.Executors

class MainActivity : Activity() {
 private lateinit var router: ServiceRouter
 private lateinit var config: JSONObject
 private lateinit var theme: JSONObject
 private lateinit var packagedTheme: JSONObject
 private lateinit var navigation: LinearLayout
 private val handler = Handler(Looper.getMainLooper())
 private var runtimeVersion = -1L
 private var syncing = false
 private var resumed = false
 private var showingDetail = false
 private var currentCategory = ""
 private var generation = 0
 private var updateDialog: AlertDialog? = null
 private var shownUpdate = ""
 private lateinit var cacheKey: String
 private val poll = object : Runnable { override fun run() { syncOperations(); if (resumed) handler.postDelayed(this, 15000) } }
 private lateinit var body: LinearLayout
 private lateinit var root: LinearLayout
 private val worker = Executors.newSingleThreadExecutor()
 private var token = ""
 private var currentPage = "home"
 private var accent = Color.CYAN
 private var foreground = Color.WHITE
 private fun color(name: String, fallback: Int): Int = try { Color.parseColor(theme.optJSONObject("colors")?.optString(name)) } catch (_: Exception) { fallback }
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  config = JSONObject(assets.open("runtime.json").bufferedReader().use { it.readText() })
  router = ServiceRouter(config, getPreferences(MODE_PRIVATE))
  theme = JSONObject(assets.open("manifest.json").bufferedReader().use { it.readText() }).getJSONObject("theme")
  packagedTheme = JSONObject(theme.toString())
  cacheKey = MessageDigest.getInstance("SHA-256").digest((config.optString("apiBase") + config.optString("device") + theme.toString()).toByteArray()).joinToString("") { "%02x".format(it) }
  try { val cached = getPreferences(MODE_PRIVATE).getString(cacheKey, null); if (cached != null) applyOperations(JSONObject(cached)) } catch (_: Exception) { getPreferences(MODE_PRIVATE).edit().remove(cacheKey).apply() }
  accent = color("accent", Color.CYAN); foreground = color("text", Color.WHITE)
  title = config.getString("name")
  root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(20, 16, 20, 12); setBackgroundColor(color("background", Color.BLACK)) }
  // Android 15+ lays this target SDK behind system bars; keep controls in the safe area.
  if (android.os.Build.VERSION.SDK_INT >= 35) root.setOnApplyWindowInsetsListener { view, insets ->
   val safe = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
   view.setPadding(20 + safe.left, 16 + safe.top, 20 + safe.right, 12 + safe.bottom)
   insets
  }
  setContentView(root)
  root.requestApplyInsets()
  val title = TextView(this).apply { text = theme.optJSONObject("brand")?.optString("name", config.getString("name")) ?: config.getString("name"); textSize = 26f; setTextColor(accent) }; root.addView(title)
  theme.optJSONObject("brand")?.optString("tagline")?.takeIf { it.isNotBlank() }?.let { tagline -> root.addView(TextView(this).apply { text = tagline; setTextColor(this@MainActivity.foreground) }) }
  val scroll = ScrollView(this); body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; scroll.addView(body)
  root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
  navigation = LinearLayout(this); root.addView(navigation); renderNavigation(); showPage("home")
 }
 private fun platform(): String = if (config.optString("device") == "desktop") "web" else config.optString("device", "mobile")
 private fun feature(page: String): Boolean = theme.optJSONObject("features")?.let { when (page) { "member" -> it.optBoolean("member", true); "ranking" -> it.optBoolean("ranking", true); "schedule" -> it.optBoolean("schedule", true); else -> true } } ?: true
 private fun renderNavigation() {
  navigation.removeAllViews(); val items = theme.optJSONArray("navigation") ?: JSONArray()
  for (i in 0 until items.length()) { val item = items.getJSONObject(i); if (item.optBoolean("enabled", true) && feature(item.optString("page"))) navigation.addView(button(item.optString("label")) { showPage(item.optString("page", "home"), item.optString("categoryId")) }, LinearLayout.LayoutParams(0, -2, 1f)) }
 }
 private fun applyOperations(response: JSONObject) {
  require(response.optString("contract") == "hetun-operations-v1" && response.optInt("schemaVersion") == 1 && response.optString("platform") == platform()) { "运营协议或设备不匹配" }
  val content = response.getJSONObject("config")
  val merged = JSONObject(packagedTheme.toString())
  val lists = mapOf("sections" to listOf("id","enabled","page","title","subtitle","source","categoryId","limit","orderBy","manualIds"), "navigation" to listOf("id","label","enabled","page","categoryId"), "categories" to listOf("id","label","enabled","page","categoryId"))
  for ((key, fields) in lists) {
   val incoming = content.optJSONArray(key) ?: continue; require(incoming.length() <= 40)
   val original = packagedTheme.optJSONArray(key) ?: JSONArray(); val output = JSONArray()
   for (i in 0 until incoming.length()) { val entry = incoming.getJSONObject(i); var base = JSONObject()
    for (j in 0 until original.length()) if (original.getJSONObject(j).optString("id") == entry.optString("id")) base = JSONObject(original.getJSONObject(j).toString())
    for (field in fields) if (entry.has(field)) base.put(field, entry.get(field)); output.put(base)
   }; merged.put(key, output)
  }
  for (key in listOf("features","schedule","clientSettings")) if (content.has(key)) merged.put(key, content.get(key))
  content.optJSONObject("announcement")?.let { incoming -> val note = JSONObject(packagedTheme.optJSONObject("announcement")?.toString() ?: "{}"); for (field in listOf("enabled","text","title","frequency","actionLabel","page","url")) if (incoming.has(field)) note.put(field,incoming.get(field)); merged.put("announcement",note) }
  theme = merged; runtimeVersion = response.getLong("version")
 }
 private fun syncOperations() {
  if (syncing || config.optString("apiBase").isBlank()) return
  syncing = true
  worker.execute { try {
   val response = request("/api/client/bootstrap?platform=" + Uri.encode(platform()) + "&os=android&version=" + Uri.encode(config.optString("versionName")) + "&contract=hetun-operations-v1")
   runOnUiThread { if (!isDestroyed) { try {
    if (response.getLong("version") != runtimeVersion) { applyOperations(response); getPreferences(MODE_PRIVATE).edit().putString(cacheKey,response.toString()).apply(); renderNavigation(); if (!showingDetail && currentPage !in listOf("member","mine","search")) showPage(currentPage,currentCategory) }
    showUpdate(response.optJSONObject("update"))
   } catch (e: Exception) { Toast.makeText(this,e.message,Toast.LENGTH_LONG).show() } } }
  } catch (_: Exception) { /* Keep the packaged theme or last validated operational snapshot offline. */ }
  finally { runOnUiThread { syncing = false } } }
 }
 private fun showUpdate(update: JSONObject?) {
  if (update?.optBoolean("available") != true) { updateDialog?.dismiss(); updateDialog=null; shownUpdate=""; return }
  val required=update.optBoolean("required"); val settings=theme.optJSONObject("clientSettings")
  if (!required && settings?.optBoolean("notifyOnLaunch",true) == false) return
  val version=update.optString("version"); val signature=version + ":" + required + ":" + update.optString("url"); if (shownUpdate == signature) return
  val url=update.optString("url"); if (!url.startsWith("https://")) return
  updateDialog?.dismiss(); shownUpdate=signature
  val builder=AlertDialog.Builder(this).setTitle("发现新版本 " + version).setMessage(update.optString("notes")).setCancelable(!required).setPositiveButton("前往更新",null)
  if (!required) builder.setNegativeButton("稍后",null)
  val dialog=builder.create(); updateDialog=dialog; dialog.show()
  dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener { try { startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url))); if (!required) dialog.dismiss() } catch (_: Exception) { Toast.makeText(this,"无法打开更新地址",Toast.LENGTH_LONG).show() } }
 }
 override fun onResume() { super.onResume(); resumed=true; handler.removeCallbacks(poll); handler.post(poll) }
 override fun onPause() { resumed=false; handler.removeCallbacks(poll); super.onPause() }
 private fun text(value: String, size: Float = 17f) { body.addView(TextView(this).apply { text = value; textSize = size; setTextColor(this@MainActivity.foreground); setPadding(4, 10, 4, 10) }) }
 private fun button(label: String, click: () -> Unit): Button = Button(this).apply { text = label; isFocusable = true; setOnClickListener { click() } }
 private fun request(route: String, payload: JSONObject? = null): JSONObject {
  require(config.optString("apiBase").isNotBlank()) { "尚未配置影视后台，请在打包器填写 HTTPS 地址。" }
  val attempted=mutableSetOf<String>()
  while(true) {
   val base=router.resolve(attempted);attempted.add(base)
   val target=URL(base+route);require(target.protocol=="https") { "影视接口仅支持 HTTPS" }
   val connection=target.openConnection() as HttpURLConnection
   connection.connectTimeout=12000;connection.readTimeout=20000;connection.instanceFollowRedirects=false
   connection.setRequestProperty("X-Hetun-Platform",platform())
   if(token.isNotBlank())connection.setRequestProperty("Authorization","Bearer "+token)
   try {
    if(payload!=null){connection.requestMethod="POST";connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json");connection.outputStream.use{it.write(payload.toString().toByteArray())}}
    val code=connection.responseCode
    val stream=if(code in 200..299)connection.inputStream else connection.errorStream
    val bytes=stream?.use{readLimited(it,8*1024*1024)} ?: ByteArray(0)
    check(bytes.size<=8*1024*1024){"接口响应过大"}
    val data=JSONObject(if(bytes.isEmpty())"{}" else String(bytes,Charsets.UTF_8))
    check(code in 200..299){data.optString("error","接口响应异常："+code)}
    return data
   } catch(e:java.io.IOException) {
    // POST may already have reached the server (e.g. payment); never replay it automatically.
    if(payload!=null || !router.enabled || attempted.size>=5)throw e
   } finally {connection.disconnect()}
  }
 }

 private fun load(route: String, payload: JSONObject? = null, done: (JSONObject) -> Unit) {
  val capturedGeneration = generation
  worker.execute { try { val result = request(route, payload); runOnUiThread { if (!isFinishing && !isDestroyed && generation == capturedGeneration) done(result) } } catch (e: Exception) { runOnUiThread { if (!isFinishing && !isDestroyed) Toast.makeText(this, e.message, Toast.LENGTH_LONG).show() } } }
 }
 private fun showPage(page: String, category: String = "") {
  generation++; showingDetail=false; currentPage = page; currentCategory=category; body.removeAllViews()
  if (!feature(page)) { text("当前功能已关闭"); return }
  val note = theme.optJSONObject("announcement"); if (note?.optBoolean("enabled") == true) text(note.optString("text"))
  if (page == "member" || page == "mine") { account(); return }
  if (page == "schedule") { text("排期表", 23f); text(theme.optJSONArray("schedule")?.toString(2) ?: "暂无排期"); return }
  val row = LinearLayout(this); val search = EditText(this).apply { hint = "搜索影片"; setTextColor(this@MainActivity.foreground); setHintTextColor(Color.GRAY); isSingleLine = true }
  row.addView(search, LinearLayout.LayoutParams(0, -2, 1f)); row.addView(button("搜索") { body.removeAllViews(); catalog("/api/catalog?page=1&keyword=" + Uri.encode(search.text.toString())) }); body.addView(row)
  val categories = theme.optJSONArray("categories") ?: JSONArray(); val horizontal = HorizontalScrollView(this); val categoryRow = LinearLayout(this)
  for (i in 0 until categories.length()) { val c = categories.getJSONObject(i); if (c.optBoolean("enabled", true) && feature(c.optString("page"))) categoryRow.addView(button(c.optString("label")) { showPage("category", c.optString("categoryId")) }) }; horizontal.addView(categoryRow); body.addView(horizontal)
  if (config.optString("apiBase").isBlank()) text("尚未配置影视中心 · 在打包器填写 HTTPS 地址后加载影片")
  val sections = theme.optJSONArray("sections") ?: JSONArray()
  if (page != "home") { text(if (page == "ranking") "排行榜" else "影片", 23f); catalog("/api/catalog?page=1&category=" + Uri.encode(category)); return }
  for (i in 0 until sections.length()) { val s = sections.getJSONObject(i); if (!s.optBoolean("enabled", true) || s.optString("page", "home") != "home") continue
   text(s.optString("title"), 22f); val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; body.addView(box)
   if (config.optString("apiBase").isBlank()) { box.addView(TextView(this).apply { text = "主题栏目 · " + s.optString("style", "grid3"); setTextColor(this@MainActivity.foreground) }); continue }
   val route = "/api/catalog?page=1&category=" + Uri.encode(if (s.optString("source","category") == "category") s.optString("categoryId") else "") + "&ids=" + Uri.encode(if (s.optString("orderBy") == "manual") s.optString("manualIds") else "") + "&orderBy=" + Uri.encode(s.optString("orderBy","latest"))
   val captured = page
   load(route) { data -> if (currentPage == captured && box.parent != null) renderItems(data.optJSONArray("items") ?: JSONArray(), box, s.optInt("limit", 6)) }
  }
 }
 private fun catalog(route: String) { val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; body.addView(box); val captured = currentPage; load(route) { if (currentPage == captured && box.parent != null) renderItems(it.optJSONArray("items") ?: JSONArray(), box, 60) } }
 private fun renderItems(items: JSONArray, box: LinearLayout, limit: Int) {
  for (i in 0 until minOf(items.length(), limit)) { val item = items.getJSONObject(i); val row = LinearLayout(this)
   val image = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP }; row.addView(image, LinearLayout.LayoutParams(100, 145)); val poster = item.optString("poster")
   if (poster.startsWith("https://")) worker.execute { try { val c = URL(poster).openConnection() as HttpURLConnection; c.connectTimeout = 8000; c.readTimeout = 8000; try { val bmp = c.inputStream.use { BitmapFactory.decodeStream(it) }; runOnUiThread { if (!isDestroyed) image.setImageBitmap(bmp) } } finally { c.disconnect() } } catch (_: Exception) {} }
   row.addView(button(item.optString("title") + "\n" + item.optString("note")) { detail(item) }, LinearLayout.LayoutParams(0, -1, 1f)); box.addView(row)
  }
 }
 private fun detail(item: JSONObject) {
  generation++; showingDetail=true
  body.removeAllViews(); text(item.optString("title"), 25f); text(item.optString("description")); body.addView(button("返回") { showPage("home") })
  val sources = item.optJSONArray("sources") ?: JSONArray()
  for (sid in 0 until sources.length()) { val source = sources.getJSONObject(sid); text(source.optString("name")); val episodes = source.optJSONArray("episodes") ?: JSONArray()
   for (nid in 0 until episodes.length()) body.addView(button(episodes.getJSONObject(nid).optString("name")) {
    load("/api/playback", JSONObject().put("id", item.get("id")).put("sid", sid + 1).put("nid", nid + 1)) { result ->
     val url = result.optString("url"); if (!url.startsWith("https://")) { text("播放地址必须为 HTTPS"); return@load }
     val video = VideoView(this); body.removeAllViews(); body.addView(video, LinearLayout.LayoutParams(-1, 600)); val controls = MediaController(this); controls.setAnchorView(video); video.setMediaController(controls); video.setVideoURI(Uri.parse(url)); video.setOnPreparedListener { video.start() }; body.addView(button("返回详情") { video.stopPlayback(); detail(item) })
    }
   })
  }
 }
 private fun account() {
  text("会员中心", 25f); val username = EditText(this).apply { hint = "用户名"; setTextColor(this@MainActivity.foreground) }; val password = EditText(this).apply { hint = "密码"; inputType = 129; setTextColor(this@MainActivity.foreground) }; body.addView(username); body.addView(password)
  body.addView(button("登录") { load("/api/member/login", JSONObject().put("username", username.text.toString()).put("password", password.text.toString())) { token = it.getString("token"); body.removeAllViews(); text("登录成功"); text(it.optJSONObject("profile")?.toString(2) ?: ""); body.addView(button("退出登录") { load("/api/member/logout", JSONObject()) { token = ""; showPage("member") } }) } })
 }
 override fun onDestroy() { handler.removeCallbacksAndMessages(null); updateDialog?.dismiss(); worker.shutdownNow(); super.onDestroy() }
}
