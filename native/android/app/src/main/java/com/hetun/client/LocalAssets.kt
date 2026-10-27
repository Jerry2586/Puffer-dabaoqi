package com.hetun.client

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.*
import java.io.ByteArrayInputStream

/** No user supplied HTML/JS, runtime.json, or filesystem paths are reachable through this origin. */
class LocalAssets(private val assets:AssetManager,private val failure:(String)->Unit):WebViewClient(){
 private val mediaLengths=java.util.concurrent.ConcurrentHashMap<String,Long>()
 companion object {
  const val HOST="appassets.androidplatform.net"
  const val ENTRY="https://appassets.androidplatform.net/client/index.html"
  fun safeExternal(value:String):Boolean=try{val u=Uri.parse(value);value.length<=4096&&u.scheme=="https"&&!u.host.isNullOrBlank()&&u.userInfo==null&&u.port in listOf(-1,443)&&!value.any{it.isWhitespace()}}catch(_:Exception){false}
 }
 override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
  val url=request.url
  // Internal hash routes share one trusted document. External pages never inherit the bridge.
  return !(request.isForMainFrame&&url.scheme=="https"&&url.host==HOST&&url.port == -1&&url.userInfo==null&&url.path=="/client/index.html")
 }
 override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse? {
  val uri=request.url
  if(uri.scheme!="https"||uri.host!=HOST)return if(request.isForMainFrame)denied()else null
  if(request.method!="GET"||uri.port != -1||uri.userInfo!=null||uri.query!=null)return denied()
  val raw=uri.encodedPath ?: return denied()
  if(raw.contains('%')||raw.contains('\\')||raw.split('/').any{it==".."||it=="."})return denied()
  val asset=when {
   raw=="/client/"||raw=="/client/index.html" -> "client/index.html"
   raw.matches(Regex("/client/assets/[A-Za-z0-9_./-]+\\.(js|css|png|jpg|jpeg|webp|gif|svg|woff2?|ttf|ico)$")) -> raw.drop(1)
   raw.matches(Regex("/assets/[a-f0-9]{64}\\.(png|jpg|webp|svg|mp4)$")) -> raw.drop(1)
   else -> return denied()
  }
  val extension=asset.substringAfterLast('.');val mime=when(extension){"js"->"application/javascript";"css"->"text/css";"html"->"text/html";"svg"->"image/svg+xml";"jpg","jpeg"->"image/jpeg";"mp4"->"video/mp4";"woff","woff2"->"font/"+extension;else->MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"}
  return try{
   val headers=mutableMapOf("X-Content-Type-Options" to "nosniff","Cache-Control" to "no-cache")
   if(extension=="html")headers["Content-Security-Policy"]="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'none'"
   if(extension=="mp4"){
    val total=mediaLengths.getOrPut(asset){
     try{assets.openFd(asset).use{it.length}}catch(_:java.io.IOException){assets.open(asset).use{input -> val buffer=ByteArray(8192);var size=0L;while(true){val count=input.read(buffer);if(count<0)break;size+=count};size}}
    }
    val selected=ByteRanges.select(request.requestHeaders.entries.firstOrNull{it.key.equals("Range",true)}?.value,total)
    headers["Accept-Ranges"]="bytes";headers["Content-Length"]=selected.length.toString()
    if(selected.status!=200)headers["Content-Range"]=selected.contentRange
    val input=if(selected.status==416)ByteArrayInputStream(ByteArray(0))else ByteRanges.stream(assets.open(asset),selected)
    WebResourceResponse(mime,null,selected.status,when(selected.status){206->"Partial Content";416->"Range Not Satisfiable";else->"OK"},headers,input)
   }else WebResourceResponse(mime,"UTF-8",200,"OK",headers,assets.open(asset))
  }catch(_:Exception){denied()}
 }
 override fun onReceivedError(view:WebView,request:WebResourceRequest,error:WebResourceError){if(request.isForMainFrame)failure("客户端页面加载失败："+error.description)}
 private fun denied()=WebResourceResponse("text/plain","UTF-8",404,"Not Found",mapOf("Cache-Control" to "no-store"),ByteArrayInputStream(ByteArray(0)))
}
