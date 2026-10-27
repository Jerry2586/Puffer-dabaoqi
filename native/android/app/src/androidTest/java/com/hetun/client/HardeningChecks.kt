package com.hetun.client

import android.app.Instrumentation
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject

/** Exercises queue saturation, lifecycle cancellation and actual WebView asset responses. */
internal object HardeningChecks {
 fun run(host:Instrumentation,report:(String)->Unit):Int {
  var checks=0
  fun test(name:String,body:()->Unit){body();checks++;report(name)}
  fun reply()=ServiceResponse(JSONObject(),"https://service.example")
  test("single byte ranges honor bounds, suffix, overflow and EOF") {
   val cases=mapOf("bytes=3-5" to ByteSelection(206,3,3,10),"bytes=7-" to ByteSelection(206,7,3,10),"bytes=-4" to ByteSelection(206,6,4,10),"bytes=8-99" to ByteSelection(206,8,2,10),"bytes=-99" to ByteSelection(206,0,10,10),"bytes=10-" to ByteSelection(416,0,0,10),"bytes=-0" to ByteSelection(416,0,0,10),"bytes=5-3" to ByteSelection(200,0,10,10),"bytes=1-2,4-5" to ByteSelection(200,0,10,10),"bytes=9223372036854775808-" to ByteSelection(200,0,10,10))
   for((header,expected) in cases)check(ByteRanges.select(header,10)==expected){header}
   check(ByteRanges.select("bytes=0-",0).status==416)
   val data=ByteArray(10){it.toByte()}
   ByteRanges.stream(ByteArrayInputStream(data),ByteRanges.select("bytes=3-5",10)).use{check(it.read()==3);check(it.readBytes().contentEquals(byteArrayOf(4,5)));check(it.read()==-1)}
   ByteRanges.stream(ByteArrayInputStream(data),ByteRanges.select("bytes=-3",10)).use{check(it.skip(2)==2L);check(it.read()==9);check(it.skip(4)==0L);check(it.available()==0)}
  }
  test("slow content cannot block authentication or operations") {
   val requests=NativeRequests(4000);val started=CountDownLatch(3);val release=CountDownLatch(1);val fast=CountDownLatch(2)
   try{
    repeat(3){index -> check(requests.submit("content-$index",NativeRequests.Lane.CONTENT,{started.countDown();release.await(3,TimeUnit.SECONDS);reply()}){_,_->})}
    check(started.await(2,TimeUnit.SECONDS))
    for(lane in listOf(NativeRequests.Lane.AUTH,NativeRequests.Lane.OPERATIONS))check(requests.submit(lane.name,lane,{reply()}){value,error -> check(value!=null&&error==null);fast.countDown()})
    check(fast.await(1,TimeUnit.SECONDS)){"content blocked independent lanes"}
   }finally{release.countDown();requests.close()}
  }
  test("deadline includes queue time and emits exactly one completion") {
   val requests=NativeRequests(700);val start=System.nanoTime();val done=CountDownLatch(4);val completions=AtomicInteger();val queuedWork=AtomicInteger();val release=CountDownLatch(1)
   try{
    repeat(3){index -> check(requests.submit("slow-$index",NativeRequests.Lane.CONTENT,{while(release.count>0)try{release.await(3,TimeUnit.SECONDS)}catch(_:InterruptedException){};reply()}){_,error -> check(error!=null);completions.incrementAndGet();done.countDown()})}
    check(requests.submit("queued",NativeRequests.Lane.CONTENT,{queuedWork.incrementAndGet();reply()}){_,error -> check(error!=null);completions.incrementAndGet();done.countDown()})
    check(done.await(2,TimeUnit.SECONDS)){"deadline callbacks blocked"};check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<1800);check(queuedWork.get()==0)
    release.countDown();Thread.sleep(100);check(completions.get()==4)
   }finally{release.countDown();requests.close()}
  }
  test("signed directory recovery applies the shared deadline to a real stalled TLS socket") {
   val server=java.net.ServerSocket(0,1,java.net.InetAddress.getByName("127.0.0.1"))
   val accepted=CountDownLatch(1);val release=CountDownLatch(1);val finished=CountDownLatch(1);val delivered=CountDownLatch(1)
   val thread=Thread{try{server.accept().use{accepted.countDown();release.await(5,TimeUnit.SECONDS)}}catch(_:Exception){}}.apply{isDaemon=true;start()}
   val requests=NativeRequests(700)
   val url="https://127.0.0.1:"+server.localPort
   val config=JSONObject().put("apiBase",url).put("serviceDirectory",JSONObject().put("publicKey","test-only-unreached-key").put("addresses",org.json.JSONArray().put(url)).put("recoveryUrls",org.json.JSONArray()))
   val prefs=host.targetContext.getSharedPreferences("r027-stalled-directory",0)
   try{
    val router=ServiceRouter(config,prefs)
    check(requests.submit("recovery",NativeRequests.Lane.CONTENT,{budget -> try{router.resolve(budget=budget);reply()}finally{finished.countDown()}}){_,error -> check(error!=null);delivered.countDown()})
    check(accepted.await(2,TimeUnit.SECONDS)){"TLS fixture was not reached"}
    check(delivered.await(2,TimeUnit.SECONDS)){"Recovery did not respect the total deadline"}
    check(finished.await(2,TimeUnit.SECONDS)){"Recovery socket remained blocked after its deadline"}
   }finally{requests.close();release.countDown();server.close();thread.join(1000);prefs.edit().clear().commit()}
  }
  test("cancellation and Activity shutdown suppress late callbacks") {
   val requests=NativeRequests(2000);val started=CountDownLatch(1);val release=CountDownLatch(1);val done=CountDownLatch(1);val callbacks=AtomicInteger()
   try{
    check(requests.submit("cancel",NativeRequests.Lane.AUTH,{started.countDown();try{release.await(2,TimeUnit.SECONDS)}catch(_:InterruptedException){};done.countDown();reply()}){_,_->callbacks.incrementAndGet()})
    check(started.await(1,TimeUnit.SECONDS));requests.cancel("cancel");release.countDown();check(done.await(1,TimeUnit.SECONDS));requests.close();Thread.sleep(100);check(callbacks.get()==0)
    check(!requests.submit("closed",NativeRequests.Lane.AUTH,{reply()}){_,_->callbacks.incrementAndGet()})
   }finally{release.countDown();requests.close()}
  }
  test("blocking socket disconnect never blocks timeout delivery or close") {
   val requests=NativeRequests(600);val disconnectRelease=CountDownLatch(1);val done=CountDownLatch(5);val connected=CountDownLatch(5)
   try{
    val lanes=listOf(NativeRequests.Lane.CONTENT,NativeRequests.Lane.CONTENT,NativeRequests.Lane.CONTENT,NativeRequests.Lane.AUTH,NativeRequests.Lane.OPERATIONS)
    for((index,lane) in lanes.withIndex())check(requests.submit("socket-$index",lane,{budget ->
     val connection=object:HttpURLConnection(URL("https://service.example")){override fun connect(){};override fun usingProxy()=false;override fun disconnect(){try{disconnectRelease.await(3,TimeUnit.SECONDS)}catch(_:InterruptedException){}}}
     budget.attach(connection,12000,20000);check(connection.connectTimeout<=600&&connection.readTimeout<=600);connected.countDown();CountDownLatch(1).await(3,TimeUnit.SECONDS);reply()
    }){_,error -> check(error!=null);done.countDown()})
    check(connected.await(1,TimeUnit.SECONDS));check(done.await(2,TimeUnit.SECONDS)){"disconnect blocked deadlines"}
    val before=System.nanoTime();requests.close();check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-before)<500)
   }finally{disconnectRelease.countDown();requests.close()}
  }
  test("WebView asset interception serves real partial bytes and rejects traversal") {
   lateinit var view:WebView;host.runOnMainSync{view=WebView(host.targetContext)}
   val assets=LocalAssets(host.context.assets){}
   val path="/assets/"+"a".repeat(64)+".mp4"
   fun request(pathname:String,range:String?=null)=object:WebResourceRequest{
    override fun getUrl()=Uri.parse("https://appassets.androidplatform.net"+pathname)
    override fun isForMainFrame()=false;override fun isRedirect()=false;override fun hasGesture()=false;override fun getMethod()="GET"
    override fun getRequestHeaders():Map<String,String> = if(range==null)emptyMap()else mapOf("rAnGe" to range)
   }
   try{
    val response=assets.shouldInterceptRequest(view,request(path,"bytes=200-209"))!!;check(response.statusCode==206);check(response.responseHeaders["Content-Range"]=="bytes 200-209/256");check(response.responseHeaders["Content-Length"]=="10");response.data.use{check(it.readBytes().contentEquals(ByteArray(10){(200+it).toByte()}))}
    val suffix=assets.shouldInterceptRequest(view,request(path,"bytes=-2"))!!;check(suffix.statusCode==206);suffix.data.use{check(it.readBytes().contentEquals(byteArrayOf(254.toByte(),255.toByte())))}
    val invalid=assets.shouldInterceptRequest(view,request(path,"bytes=256-"))!!;check(invalid.statusCode==416);check(invalid.responseHeaders["Content-Range"]=="bytes */256");invalid.data.use{check(it.read()==-1)}
    val traversal=assets.shouldInterceptRequest(view,request("/assets/../runtime.json"))!!;check(traversal.statusCode==404);traversal.data.close()
   }finally{host.runOnMainSync{view.destroy()}}
  }
  test("installed WebView receives actual asynchronous external launch results") {
   val intent=android.content.Intent().setClassName(host.targetContext.packageName,"com.hetun.client.MainActivity").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK)
   val activity=host.startActivitySync(intent)
   fun find(view:android.view.View):WebView?{if(view is WebView)return view;if(view is android.view.ViewGroup)for(i in 0 until view.childCount){val found=find(view.getChildAt(i));if(found!=null)return found};return null}
   lateinit var web:WebView;host.runOnMainSync{web=requireNotNull(find(activity.window.decorView))}
   fun evaluate(script:String):String?{val done=CountDownLatch(1);var value:String?=null;host.runOnMainSync{web.evaluateJavascript(script){value=it;done.countDown()}};check(done.await(5,TimeUnit.SECONDS)){"WebView evaluation timeout"};return value}
   fun awaitValue(script:String,expected:String){val end=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(System.nanoTime()<end){if(evaluate(script)==expected)return;Thread.sleep(100)};error("Missing WebView result: "+script)}
   try{
    awaitValue("document.readyState==='complete' && !!window.HetunNative","true")
    evaluate("window.__launchResults={};window.addEventListener('hetun-external',e=>window.__launchResults[e.detail.id]=e.detail.opened);HetunNative.ready();true")
    evaluate("HetunNative.openExternal('900001','http://127.0.0.1/');true")
    awaitValue("window.__launchResults['900001']","false")
    evaluate("HetunNative.openExternal('900002','https://user:password@127.0.0.1/');true")
    awaitValue("window.__launchResults['900002']","false")
    evaluate("HetunNative.openExternal('900003','https://127.0.0.1/');true")
    awaitValue("window.__launchResults['900003']","true")
   }finally{host.runOnMainSync{activity.finish()}}
  }
  test("system back dispatch reaches the installed client WebView") {
   val intent=android.content.Intent().setClassName(host.targetContext.packageName,"com.hetun.client.MainActivity").addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK)
   val activity=host.startActivitySync(intent);val backEvent=CountDownLatch(1)
   fun find(view:android.view.View):WebView?{if(view is WebView)return view;if(view is android.view.ViewGroup)for(i in 0 until view.childCount){val found=find(view.getChildAt(i));if(found!=null)return found};return null}
   lateinit var web:WebView;host.runOnMainSync{
    web=requireNotNull(find(activity.window.decorView))
    web.webChromeClient=object:android.webkit.WebChromeClient(){override fun onConsoleMessage(message:android.webkit.ConsoleMessage):Boolean{if(message.message()=="r027-system-back")backEvent.countDown();return true}}
   }
   try{
    val loadDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
    var loaded=false
    while(!loaded&&System.nanoTime()<loadDeadline){
     val done=CountDownLatch(1)
     host.runOnMainSync{web.evaluateJavascript("document.readyState==='complete' && !!window.HetunNative"){loaded=it=="true";done.countDown()}}
     check(done.await(5,TimeUnit.SECONDS));if(!loaded)Thread.sleep(100)
    }
    check(loaded){"Bundled client did not load"}
    val ready=CountDownLatch(1)
    host.runOnMainSync{web.evaluateJavascript("window.addEventListener('hetun-back',()=>console.log('r027-system-back'));HetunNative.ready();true"){ready.countDown()}}
    check(ready.await(5,TimeUnit.SECONDS))
    val focusDeadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5)
    while(!activity.hasWindowFocus()&&System.nanoTime()<focusDeadline)Thread.sleep(100)
    check(activity.hasWindowFocus()){"Client did not become foreground"}
    // Home-page back is allowed to finish the client, but must first reach the WebView.
    host.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
    check(backEvent.await(5,TimeUnit.SECONDS)){"System back bypassed the WebView"}
   }finally{host.runOnMainSync{activity.finish()}}
  }
  return checks
 }
}
