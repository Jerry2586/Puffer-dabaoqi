package com.hetun.client

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import android.content.Intent
import android.webkit.WebView
import android.view.ViewGroup
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/** Runs against Android's real org.json and Uri implementations without test dependencies. */
class OperationsTestRunner : Instrumentation() {
 private var options=Bundle()
 override fun onCreate(arguments:Bundle?) { options=arguments?:Bundle();super.onCreate(arguments); start() }
 override fun onStart() {
  if(options.containsKey("expectedTitle")){verifyLive();return}
  val results=Bundle();var count=0
  fun test(name:String,body:()->Unit){body();count++;sendStatus(0,Bundle().apply{putString("stream","PASS: "+name+"\n")})}
  fun rejected(body:()->Unit){var failed=false;try{body()}catch(_:Exception){failed=true};check(failed){"invalid configuration accepted"}}
  fun envelope(config:String="{}",platform:String="mobile")=JSONObject().put("schemaVersion",1).put("contract","hetun-operations-v1").put("themeContract","hetun-runtime-v1").put("platform",platform).put("version",1).put("config",JSONObject(config))
  val packaged=JSONObject("""{"colors":{"accent":"#123456"},"skeleton":{"kind":"gallery"},"sections":[{"id":"s1","title":"local","style":"mosaic","background":"#234567","textColor":"#ffffff"}],"carousel":{"height":321,"slides":[]},"announcement":{"background":"#345678"},"pageDesign":{"home":{"background":"#456789"}}}""")
  try {
   test("content changes preserve packaged appearance") {
    val response=envelope("""{"colors":{"accent":"#ffffff"},"skeleton":{"kind":"minimal"},"pageDesign":{"home":{"background":"#ffffff"}},"sections":[{"id":"s1","title":"published","style":"list","background":"#ffffff"}]}""")
    val merged=Operations.merge(packaged,response,"mobile","https://actual.example")
    check(merged.getJSONObject("colors").getString("accent")=="#123456")
    check(merged.getJSONObject("skeleton").getString("kind")=="gallery")
    val section=merged.getJSONArray("sections").getJSONObject(0)
    check(section.getString("title")=="published"&&section.getString("style")=="mosaic"&&section.getString("background")=="#234567")
    check(packaged.getJSONArray("sections").getJSONObject(0).getString("title")=="local")
   }
   test("platform and version boundaries") {
    rejected{Operations.merge(packaged,envelope(platform="tv"),"mobile","https://actual.example")}
    for(v in listOf<Any>(0,-1,1.5,"1",9007199254740992.0))rejected{Operations.merge(packaged,envelope().put("version",v),"mobile","https://actual.example")}
    for(v in listOf<Any>(0,1.5,"1"))rejected{Operations.merge(packaged,envelope().put("schemaVersion",v),"mobile","https://actual.example")}
    rejected{Operations.merge(packaged,envelope(),"mobile","http://actual.example")}
   }
   test("asset origin is resolved service, never response serviceBase") {
    val asset="/api/assets/"+"a".repeat(64)+".png"
    val response=envelope().put("serviceBase","https://untrusted.example");response.getJSONObject("config").put("announcement",JSONObject().put("image",asset).put("title","运营公告"))
    val merged=Operations.merge(packaged,response,"mobile","https://actual.example")
    check(merged.getJSONObject("announcement").getString("image")=="https://actual.example"+asset)
    check(merged.getJSONObject("announcement").getString("background")=="#345678")
    response.getJSONObject("config").getJSONObject("announcement").put("image","javascript:alert(1)")
    rejected{Operations.merge(packaged,response,"mobile","https://actual.example")}
   }
   test("carousel and new sections retain theme design") {
    val response=envelope("""{"sections":[{"id":"new","title":"new section"}],"carousel":{"height":20,"slides":[{"id":"slide","title":"new slide","image":"https://actual.example/p.jpg","page":"shortdrama"}]}}""")
    val merged=Operations.merge(packaged,response,"mobile","https://actual.example")
    check(merged.getJSONArray("sections").getJSONObject(0).getString("style")=="mosaic")
    check(merged.getJSONObject("carousel").getInt("height")==321)
    check(merged.getJSONObject("carousel").getJSONArray("slides").getJSONObject(0).getString("page")=="shortdrama")
   }
   test("invalid IDs and flag types fail closed") {
    rejected{Operations.merge(packaged,envelope("""{"sections":[{"id":"same"},{"id":"same"}]}"""),"mobile","https://actual.example")}
    rejected{Operations.merge(packaged,envelope("""{"features":{"member":"true"}}"""),"mobile","https://actual.example")}
   }
   test("client routes are scoped and admin paths stay blocked") {
    for(p in listOf("mobile","tablet","tv","web")) {
     val scope=if(p=="web")"desktop" else p
     check(ClientRoutes.networkPath("/api/client/bootstrap?os=android",p)=="/api/v1/"+scope+"/bootstrap?os=android")
     check(ClientRoutes.networkPath("/api/catalog?page=1",p)=="/api/v1/"+scope+"/catalog?page=1")
    }
    check(ClientRoutes.allowed("/api/catalog?page=1&keyword=%E7%9F%AD%E5%89%A7","GET"))
    for(route in listOf("/api/admin/state","/api/theme","/api/catalog?page=1&page=2","/api/%63atalog","/api/catalog?token=secret"))check(!ClientRoutes.allowed(route,"GET"))
   }
   test("actual Go published envelopes merge on Android") {
    val fixtures=JSONObject(context.assets.open("published-native-contract.json").bufferedReader().use{it.readText()})
    for(p in listOf("mobile","tablet","tv")) {
     val merged=Operations.merge(packaged,fixtures.getJSONObject(p),p,"https://actual.example")
     check(merged.getJSONArray("sections").getJSONObject(0).getString("title")=="native-published-"+p)
     check(merged.getJSONArray("sections").getJSONObject(0).getString("style")=="mosaic")
    }
    val update=Operations.merge(packaged,fixtures.getJSONObject("mobileUpdate"),"mobile","https://actual.example")
    check(update.getJSONObject("clientSettings").getString("latestVersion")=="1.1.0")
   }
   count+=HardeningChecks.run(this){name -> sendStatus(0,Bundle().apply{putString("stream","PASS: "+name+"\n")})}
   results.putString("stream","Passed "+count+" native contract checks\n");finish(Activity.RESULT_OK,results)
  }catch(e:Throwable){results.putString("stream","Failed after "+count+" checks: "+e.stackTraceToString());finish(Activity.RESULT_CANCELED,results)}
 }
 private fun verifyLive(){
  val result=Bundle()
  try{
   val expected=options.getString("expectedTitle")!!
   val activity=startActivitySync(Intent().setClassName(targetContext.packageName,"com.hetun.client.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
   fun find(view:android.view.View):WebView? {if(view is WebView)return view;if(view is ViewGroup)for(i in 0 until view.childCount){val found=find(view.getChildAt(i));if(found!=null)return found};return null}
   var web:WebView?=null;runOnMainSync{web=find(activity.window.decorView)}
   val packaged=JSONObject(targetContext.assets.open("manifest.json").bufferedReader().use{it.readText()}).getJSONObject("theme")
   val deadline=System.currentTimeMillis()+45000;var observed:JSONObject?=null
   while(System.currentTimeMillis()<deadline){
    val latch=CountDownLatch(1);var raw:String?=null
    runOnMainSync{web!!.evaluateJavascript("JSON.stringify({boot:JSON.parse(HetunNative.boot()),text:document.body.innerText})"){raw=it;latch.countDown()}}
    check(latch.await(5,TimeUnit.SECONDS)){"WebView evaluation timeout"}
    val encoded=raw
    if(encoded!=null&&encoded!="null"){
     val decoded=org.json.JSONTokener(encoded).nextValue() as String;val state=JSONObject(decoded);val boot=state.getJSONObject("boot");val theme=boot.getJSONObject("theme");val ops=boot.getJSONObject("runtime").getJSONObject("operations")
     if(theme.getJSONArray("sections").getJSONObject(0).getString("title")==expected&&state.getString("text").contains(expected)&&ops.getString("state")==options.getString("expectedState","connected")){observed=state;break}
    }
    Thread.sleep(500)
   }
   check(observed!=null){"Expected published title/status not rendered: "+expected}
   val boot=observed!!.getJSONObject("boot");val theme=boot.getJSONObject("theme")
   for(key in listOf("colors","visual","pageDesign","skeleton","pageStyles"))if(packaged.has(key))check(theme.get(key).toString()==packaged.get(key).toString()){"Packaged appearance changed: "+key}
   val status=boot.getJSONObject("runtime").getJSONObject("operations")
   result.putString("stream","PASS: installed WebView rendered "+expected+"; state="+status.getString("state")+"; version="+status.getLong("version")+"; packaged appearance preserved\n")
   finish(Activity.RESULT_OK,result)
  }catch(e:Throwable){result.putString("stream",e.stackTraceToString());finish(Activity.RESULT_CANCELED,result)}
 }

}
