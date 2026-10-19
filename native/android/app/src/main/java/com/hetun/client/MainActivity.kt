package com.hetun.client

import android.app.Activity
import android.os.Bundle
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
 private lateinit var config: JSONObject
 private lateinit var theme: JSONObject
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
  theme = JSONObject(assets.open("manifest.json").bufferedReader().use { it.readText() }).getJSONObject("theme")
  accent = color("accent", Color.CYAN); foreground = color("text", Color.WHITE)
  title = config.getString("name")
  root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(20, 16, 20, 12); setBackgroundColor(color("background", Color.BLACK)) }
  setContentView(root)
  val title = TextView(this).apply { text = config.getString("name"); textSize = 26f; setTextColor(accent) }; root.addView(title)
  val scroll = ScrollView(this); body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; scroll.addView(body)
  root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
  val nav = LinearLayout(this); val items = theme.optJSONArray("navigation") ?: JSONArray()
  for (i in 0 until items.length()) { val item = items.getJSONObject(i); if (item.optBoolean("enabled", true)) nav.addView(button(item.optString("label")) { showPage(item.optString("page", "home"), item.optString("categoryId")) }, LinearLayout.LayoutParams(0, -2, 1f)) }
  root.addView(nav); showPage("home")
 }
 private fun text(value: String, size: Float = 17f) { body.addView(TextView(this).apply { text = value; textSize = size; setTextColor(this@MainActivity.foreground); setPadding(4, 10, 4, 10) }) }
 private fun button(label: String, click: () -> Unit): Button = Button(this).apply { text = label; isFocusable = true; setOnClickListener { click() } }
 private fun request(route: String, payload: JSONObject? = null): JSONObject {
  val base = config.optString("apiBase"); require(base.isNotBlank()) { "尚未配置影视后台，当前为离线主题预览。" }
  val target = URL(base + route); require(target.protocol == "https") { "影视接口仅支持 HTTPS" }
  val connection = target.openConnection() as HttpURLConnection
  connection.connectTimeout = 12000; connection.readTimeout = 20000; connection.instanceFollowRedirects = false
  if (token.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer " + token)
  try {
   if (payload != null) { connection.requestMethod = "POST"; connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.use { it.write(payload.toString().toByteArray()) } }
   val code = connection.responseCode
   val stream = if (code in 200..299) connection.inputStream else connection.errorStream
   val data = JSONObject(stream?.bufferedReader()?.use { it.readText() } ?: "{}")
   check(code in 200..299) { data.optString("error", "接口响应异常：" + code) }; return data
  } finally { connection.disconnect() }
 }
 private fun load(route: String, payload: JSONObject? = null, done: (JSONObject) -> Unit) {
  worker.execute { try { val result = request(route, payload); runOnUiThread { if (!isFinishing && !isDestroyed) done(result) } } catch (e: Exception) { runOnUiThread { if (!isFinishing && !isDestroyed) Toast.makeText(this, e.message, Toast.LENGTH_LONG).show() } } }
 }
 private fun showPage(page: String, category: String = "") {
  currentPage = page; body.removeAllViews()
  val note = theme.optJSONObject("announcement"); if (note?.optBoolean("enabled") == true) text(note.optString("text"))
  if (page == "member" || page == "mine") { account(); return }
  if (page == "schedule") { text("排期表", 23f); text(theme.optJSONArray("schedule")?.toString(2) ?: "暂无排期"); return }
  val row = LinearLayout(this); val search = EditText(this).apply { hint = "搜索影片"; setTextColor(this@MainActivity.foreground); setHintTextColor(Color.GRAY); isSingleLine = true }
  row.addView(search, LinearLayout.LayoutParams(0, -2, 1f)); row.addView(button("搜索") { body.removeAllViews(); catalog("/api/catalog?page=1&keyword=" + Uri.encode(search.text.toString())) }); body.addView(row)
  val categories = theme.optJSONArray("categories") ?: JSONArray(); val horizontal = HorizontalScrollView(this); val categoryRow = LinearLayout(this)
  for (i in 0 until categories.length()) { val c = categories.getJSONObject(i); if (c.optBoolean("enabled", true)) categoryRow.addView(button(c.optString("label")) { showPage("category", c.optString("categoryId")) }) }; horizontal.addView(categoryRow); body.addView(horizontal)
  if (config.optString("apiBase").isBlank()) text("离线主题预览 · 在打包器填写 HTTPS 影视中心后加载影片")
  val sections = theme.optJSONArray("sections") ?: JSONArray()
  if (page != "home") { text(if (page == "ranking") "排行榜" else "影片", 23f); catalog("/api/catalog?page=1&category=" + Uri.encode(category)); return }
  for (i in 0 until sections.length()) { val s = sections.getJSONObject(i); if (!s.optBoolean("enabled", true) || s.optString("page", "home") != "home") continue
   text(s.optString("title"), 22f); val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; body.addView(box)
   if (config.optString("apiBase").isBlank()) { box.addView(TextView(this).apply { text = "主题栏目 · " + s.optString("style", "grid3"); setTextColor(this@MainActivity.foreground) }); continue }
   val route = "/api/catalog?page=1&category=" + Uri.encode(s.optString("categoryId")) + "&ids=" + Uri.encode(s.optString("manualIds"))
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
 override fun onDestroy() { worker.shutdownNow(); super.onDestroy() }
}
