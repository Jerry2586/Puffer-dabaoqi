package com.hetun.client

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.content.Intent
import android.net.Uri
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
import java.net.URL
import java.net.HttpURLConnection
import java.security.MessageDigest

/** Only the bundled client can access this bridge. Theme packages contain data and media, never executable pages. */
class MainActivity : Activity() {
 private lateinit var router: ServiceRouter
 private lateinit var config: JSONObject
 @Volatile private var theme = JSONObject()
 private lateinit var packagedTheme: JSONObject
 private lateinit var web: WebView
 private lateinit var root: FrameLayout
 private val handler = Handler(Looper.getMainLooper())
 private val requests = NativeRequests()
 private val authLock = Any()
 @Volatile private var token = ""
 private var authKey = ""
 private var cacheKey = ""
 @Volatile private var lastServiceBase = ""
 @Volatile private var connectionState = JSONObject().put("state","not-configured")
 private var syncing = false
 private var resumed = false
 private var ready = false
 private var pendingLink: JSONObject? = null
 private var fullscreen: View? = null
 private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
 private val poll = object : Runnable { override fun run() { syncOperations(); if(resumed)handler.postDelayed(this,15000) } }
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  config=JSONObject(assets.open("runtime.json").bufferedReader().use{it.readText()})
  router=ServiceRouter(config,getPreferences(MODE_PRIVATE))
  packagedTheme=JSONObject(assets.open("manifest.json").bufferedReader().use{it.readText()}).getJSONObject("theme")
  theme=JSONObject(packagedTheme.toString())
  fun hash(value:String)=MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString(""){"%02x".format(it)}
  val identity=config.optJSONObject("serviceDirectory")?.optString("publicKey").orEmpty().ifBlank{config.optString("apiBase")}
  authKey="auth-"+hash(identity)
  token=getPreferences(MODE_PRIVATE).getString(authKey,"") ?: ""
  cacheKey="operations-v2-"+hash(identity+config.optString("device")+theme.toString())
  connectionState=JSONObject().put("state",if(config.optString("apiBase").isBlank())"not-configured" else "connecting").put("serviceBase",config.optString("apiBase")).put("platform",platform())
  try{getPreferences(MODE_PRIVATE).getString(cacheKey,null)?.let{
   val cached=JSONObject(it);val response=cached.getJSONObject("response");val base=cached.getString("base")
   theme=Operations.merge(packagedTheme,response,platform(),base);lastServiceBase=base
   setConnection("cached",response,base)
  }}catch(_:Exception){getPreferences(MODE_PRIVATE).edit().remove(cacheKey).apply()}
  title=config.optString("name","河豚影视")
  root=FrameLayout(this)
  web=WebView(this)
  web.settings.apply {
   javaScriptEnabled=true;domStorageEnabled=true;allowFileAccess=false;allowContentAccess=false
   mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
   javaScriptCanOpenWindowsAutomatically=false;setSupportMultipleWindows(false)
   mediaPlaybackRequiresUserGesture=true
  }
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
  web.addJavascriptInterface(ClientBridge(),"HetunNative")
  web.webViewClient=LocalAssets(assets) { message -> runOnUiThread { Toast.makeText(this,message,Toast.LENGTH_LONG).show() } }
  web.webChromeClient=object:WebChromeClient(){
   override fun onShowCustomView(view:View,callback:CustomViewCallback){
    if(fullscreen!=null){callback.onCustomViewHidden();return}
    fullscreen=view;fullscreenCallback=callback;web.visibility=View.GONE;root.addView(view,FrameLayout.LayoutParams(-1,-1))
   }
   override fun onHideCustomView(){hideFullscreen()}
  }
  root.addView(web,FrameLayout.LayoutParams(-1,-1));setContentView(root)
  if(android.os.Build.VERSION.SDK_INT>=35)root.setOnApplyWindowInsetsListener{view,insets ->
   val safe=insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
   view.setPadding(safe.left,safe.top,safe.right,safe.bottom);insets
  }
  if(android.os.Build.VERSION.SDK_INT>=33)onBackInvokedDispatcher.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT){handleBack()}
  root.requestApplyInsets();openLink(intent);web.loadUrl(LocalAssets.ENTRY)
 }
 private fun platform():String=if(config.optString("device")=="desktop")"web" else config.optString("device","mobile")
 private fun emit(name:String,data:JSONObject=JSONObject()) {
  if(isDestroyed||!ready)return
  val literal=data.toString().replace("<","\\u003c").replace("\u2028","\\u2028").replace("\u2029","\\u2029")
  web.evaluateJavascript("window.dispatchEvent(new CustomEvent("+JSONObject.quote(name)+",{detail:"+literal+"}))",null)
 }
 inner class ClientBridge {
  @JavascriptInterface fun boot():String=JSONObject().put("theme",theme).put("authenticated",token.isNotBlank()).put("runtime",JSONObject()
   .put("name",config.optString("name")).put("device",platform()).put("versionName",config.optString("versionName")).put("apiBase",lastServiceBase.ifBlank{config.optString("apiBase")}).put("operations",connectionState)).toString()
  @JavascriptInterface fun ready(){runOnUiThread{if(!isDestroyed){ready=true;emit("hetun-theme",theme);emit("hetun-operations",connectionState);pendingLink?.let{emit("hetun-link",it);pendingLink=null}}}}
  @JavascriptInterface fun exit(){runOnUiThread{finish()}}
  @JavascriptInterface fun openExternal(id:String,url:String) {
   if(!id.matches(Regex("[0-9]{1,16}")))return
   val expires=android.os.SystemClock.uptimeMillis()+4000
   runOnUiThread{
    if(isDestroyed)return@runOnUiThread
    val opened=if(android.os.SystemClock.uptimeMillis()>expires||!LocalAssets.safeExternal(url))false else
     try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)));true}catch(_:Exception){false}
    emit("hetun-external",JSONObject().put("id",id).put("opened",opened))
   }
  }
  @JavascriptInterface fun cancelRequest(id:String){if(id.matches(Regex("[0-9]{1,16}")))requests.cancel(id)}
  @JavascriptInterface fun request(id:String,route:String,method:String,body:String){
   if(!id.matches(Regex("[0-9]{1,16}")))return
   fun failure(message:String){runOnUiThread{emit("hetun-response",JSONObject().put("id",id).put("error",message))}}
   if(!ClientRoutes.allowed(route,method)||body.toByteArray().size>65536){failure("客户端请求不在允许范围内");return}
   val lane=if(method=="POST"&&route.startsWith("/api/member/"))NativeRequests.Lane.AUTH else NativeRequests.Lane.CONTENT
   val accepted=requests.submit(id,lane,{budget ->
    val payload=if(method=="POST")JSONObject(if(body.isBlank())"{}" else body) else null
    request(route,payload,budget)
   }){response,error ->
    try{
     if(error!=null)throw error
     val data=requireNotNull(response).data
     synchronized(authLock){
      if(route in listOf("/api/member/login","/api/member/register")){
       val received=data.optString("token");require(received.isNotBlank()&&received.length<=16384){"登录响应缺少有效会话"}
       token=received;getPreferences(MODE_PRIVATE).edit().putString(authKey,token).apply()
      }
      if(route=="/api/member/logout"){token="";getPreferences(MODE_PRIVATE).edit().remove(authKey).apply()}
     }
     data.remove("token")
     runOnUiThread{emit("hetun-response",JSONObject().put("id",id).put("data",data))}
    }catch(e:Exception){
     synchronized(authLock){if(e is ClientHttpError&&e.status==401&&token==e.requestToken){token="";getPreferences(MODE_PRIVATE).edit().remove(authKey).apply()}}
     runOnUiThread{emit("hetun-response",JSONObject().put("id",id).put("error",e.message ?: "服务请求失败").put("status",if(e is ClientHttpError)e.status else 0))}
    }
   }
   if(!accepted)failure("请求繁忙，请稍后重试")
  }
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);openLink(intent)}
 private fun openLink(incoming:Intent?){
  if(incoming?.action!=Intent.ACTION_VIEW)return
  val uri=incoming.data ?: return;val advanced=config.optJSONObject("advanced") ?: return
  val scheme=advanced.optString("scheme");val host=advanced.optString("host")
  if(scheme.isBlank()||host.isBlank()||uri.scheme!=scheme||!uri.host.equals(host,true)||!uri.isHierarchical||uri.port != -1||uri.userInfo!=null||uri.fragment!=null)return
  val link=JSONObject()
  if(!uri.path.isNullOrEmpty()&&uri.path!="/"){
   if(uri.path!="/detail")return
   val id=uri.getQueryParameter("id") ?: return;if(!id.matches(Regex("[A-Za-z0-9_-]{1,100}")))return
   link.put("id",id)
  }
  if(ready)emit("hetun-link",link)else pendingLink=link
 }
 private fun setConnection(state:String,response:JSONObject?=null,base:String=lastServiceBase,error:String="") {
  val next=JSONObject(connectionState.toString()).put("state",state).put("platform",platform()).put("serviceBase",base).put("error",error.take(240))
  if(response!=null)next.put("version",response.getLong("version")).put("publishedAt",response.optString("publishedAt")).put("lastSync",System.currentTimeMillis())
  connectionState=next
 }
 private fun syncOperations(){
  if(syncing||config.optString("apiBase").isBlank())return
  syncing=true
  val accepted=requests.submit("operations",NativeRequests.Lane.OPERATIONS,{budget ->
   request("/api/client/bootstrap?os=android&version="+Uri.encode(config.optString("versionName"))+"&contract=hetun-operations-v1",null,budget)
  }){result,error ->
   try{
    if(error!=null)throw error
    val response=requireNotNull(result).data;val base=result.base
    val merged=Operations.merge(packagedTheme,response,platform(),base)
    getPreferences(MODE_PRIVATE).edit().putString(cacheKey,JSONObject().put("base",base).put("response",response).toString()).apply()
    runOnUiThread{if(!isDestroyed){
     val changed=merged.toString()!=theme.toString();theme=merged;setConnection("connected",response,base)
     if(changed)emit("hetun-theme",theme)
     emit("hetun-operations",connectionState)
    }}
   }catch(e:Exception){runOnUiThread{if(!isDestroyed){setConnection(if(connectionState.has("version"))"cached" else "offline",error=e.message?:"运营服务暂不可用");emit("hetun-operations",connectionState)}}}
   finally{runOnUiThread{syncing=false}}
  }
  if(!accepted)syncing=false
 }
 private fun hideFullscreen(){fullscreen?.let{root.removeView(it)};fullscreen=null;web.visibility=View.VISIBLE;fullscreenCallback?.onCustomViewHidden();fullscreenCallback=null}
 private fun handleBack(){if(fullscreen!=null)hideFullscreen()else emit("hetun-back")}
 // API 33+ uses the platform dispatcher registered in onCreate; retain legacy dispatch for API 26–32.
 @android.annotation.SuppressLint("GestureBackNavigation")
 @Deprecated("Legacy back dispatch for Android 12 and earlier") override fun onBackPressed(){handleBack()}
 override fun onResume(){super.onResume();web.onResume();resumed=true;handler.removeCallbacks(poll);handler.post(poll)}
 override fun onPause(){resumed=false;handler.removeCallbacks(poll);web.onPause();super.onPause()}
 override fun onDestroy(){ready=false;resumed=false;handler.removeCallbacksAndMessages(null);requests.close();web.removeJavascriptInterface("HetunNative");web.stopLoading();web.destroy();super.onDestroy()}
 private fun request(route: String, payload: JSONObject?, budget:RequestDeadline): ServiceResponse {
  require(config.optString("apiBase").isNotBlank()) { "尚未配置影视后台，请在打包器填写 HTTPS 地址。" }
  val attempted=mutableSetOf<String>()
  while(true) {
   budget.check()
   val base=router.resolve(attempted,budget);attempted.add(base)
   val target=URL(base+ClientRoutes.networkPath(route,platform()));require(target.protocol=="https") { "影视接口仅支持 HTTPS" }
   val connection=target.openConnection() as HttpURLConnection
   connection.instanceFollowRedirects=false
   connection.setRequestProperty("X-Hetun-Platform",platform())
   connection.setRequestProperty("X-Hetun-Channel",config.optJSONObject("advanced")?.optString("channel","default") ?: "default")
   val requestToken=token
   if(requestToken.isNotBlank())connection.setRequestProperty("Authorization","Bearer "+requestToken)
   try {
    budget.attach(connection,12000,20000)
    if(payload!=null){connection.requestMethod="POST";connection.doOutput=true;connection.setRequestProperty("Content-Type","application/json");connection.outputStream.use{it.write(payload.toString().toByteArray())}}
    val code=connection.responseCode
    val stream=if(code in 200..299)connection.inputStream else connection.errorStream
    val bytes=stream?.use{readLimited(it,8*1024*1024){budget.check()}} ?: ByteArray(0)
    check(bytes.size<=8*1024*1024){"接口响应过大"}
    val text=String(bytes,Charsets.UTF_8)
    if(code !in 200..299){
     val message=try{JSONObject(text).optString("error","接口响应异常："+code)}catch(_:Exception){"接口响应异常："+code}
     throw ClientHttpError(code,message,requestToken)
    }
    val data=JSONObject(if(text.isBlank())"{}" else text)
    budget.check();lastServiceBase=base
    return ServiceResponse(data,base)
   } catch(e:java.io.IOException) {
    // POST may already have reached the server (e.g. payment); never replay it automatically.
    budget.check()
    if(payload!=null || !router.enabled || attempted.size>=5)throw e
   } finally {budget.detach(connection)}
  }
 }

}
private class ClientHttpError(val status:Int,message:String,val requestToken:String):Exception(message)
