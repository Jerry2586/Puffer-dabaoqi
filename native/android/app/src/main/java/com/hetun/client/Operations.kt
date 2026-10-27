package com.hetun.client

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI

/** Published operations may change content; the uploaded theme remains the owner of appearance. */
internal object Operations {
 private val id = Regex("[A-Za-z0-9_-]{1,64}")
 private val asset = Regex("/api/assets/[a-f0-9]{64}\\.(png|jpg|webp|mp4)")
 private val pages = setOf("home","category","search","shortdrama","member","mine","ranking","schedule","library","history","settings","disclaimer","privacy","about")
 private val listFields = mapOf(
  "sections" to setOf("id","enabled","page","title","subtitle","source","categoryId","limit","orderBy","manualIds"),
  "navigation" to setOf("id","label","enabled","page","categoryId"),
  "categories" to setOf("id","label","enabled","page","categoryId"),
  "ads" to setOf("id","name","slot","enabled","media","asset","page","url","start","end","duration","skipAfter","frequency"),
  "schedule" to setOf("id","vodId","title","date"))
 private val booleanFields = setOf("enabled","notifyOnLaunch","forceUpdate")
 private val numberFields = setOf("limit","duration","skipAfter")
 private val mediaFields = setOf("asset","image","video","url")
 private fun origin(value:String):String {
  val u=URI(value)
  require(u.scheme=="https" && !u.host.isNullOrBlank() && u.rawUserInfo==null && u.rawQuery==null && u.rawFragment==null && (u.path.isNullOrEmpty()||u.path=="/")){"运营资源地址必须为 HTTPS 服务域名"}
  return value.trimEnd('/')
 }
 private fun media(value:String,base:String):String {
  if(value.isEmpty())return ""
  if(asset.matches(value))return base+value
  val u=URI(value)
  require(u.scheme=="https" && !u.host.isNullOrBlank() && u.rawUserInfo==null && value.length<=8192 && value.none{it.isWhitespace()}){"运营素材或链接必须使用 HTTPS"}
  return value
 }
 private fun copy(input:JSONObject,output:JSONObject,fields:Set<String>,base:String) {
  for(key in fields)if(input.has(key)) {
   val value=input.get(key)
   when(key) {
    in booleanFields -> require(value is Boolean){"运营开关格式无效"}
    in numberFields -> require(value is Number && value.toDouble()%1.0==0.0 && value.toInt() in 0..60){"运营数量格式无效"}
    else -> require(value is String && value.length<=6000){"运营文字格式无效"}
   }
   if(key=="page")require(value=="" || value in pages){"运营页面无效"}
   output.put(key,if(key in mediaFields)media(value as String,base) else value)
  }
 }
 fun merge(packaged:JSONObject,response:JSONObject,platform:String,serviceBase:String):JSONObject {
  require(response.optString("contract")=="hetun-operations-v1" && (response.opt("schemaVersion") is Number && (response.get("schemaVersion") as Number).toDouble()==1.0) && response.optString("themeContract")=="hetun-runtime-v1" && response.optString("platform")==platform){"运营协议或设备不匹配"}
  val version=response.get("version")
  require(version is Number && version.toDouble().isFinite() && version.toDouble()%1.0==0.0 && version.toDouble() in 1.0..9007199254740991.0){"运营版本无效"}
  val base=origin(serviceBase);val content=response.getJSONObject("config");val out=JSONObject(packaged.toString())
  for((key,fields)in listFields)if(content.has(key)) {
   val entries=content.getJSONArray(key);val maximum=when(key){"sections"->40;"schedule"->100;else->20}
   require(entries.length()<=maximum){"运营条目数量超过限制"}
   val originals=packaged.optJSONArray(key)?:JSONArray();val seen=mutableSetOf<String>();val result=JSONArray()
   for(i in 0 until entries.length()) {
    val item=entries.getJSONObject(i);val identifier=item.getString("id")
    require(id.matches(identifier)&&seen.add(identifier)){"运营条目编号无效或重复"}
    var style=JSONObject()
    if(key=="sections" && originals.length()>0)style=JSONObject(originals.getJSONObject(0).toString())
    for(j in 0 until originals.length())if(originals.getJSONObject(j).optString("id")==identifier)style=JSONObject(originals.getJSONObject(j).toString())
    copy(item,style,fields,base);result.put(style)
   }
   out.put(key,result)
  }
  if(content.has("features")) {
   val features=content.getJSONObject("features");val value=JSONObject(packaged.optJSONObject("features")?.toString()?:"{}")
   for(key in setOf("serviceMenu","member","shortdrama","schedule","ranking","memberCard"))if(features.has(key)){require(features.get(key)is Boolean){"运营功能开关无效"};value.put(key,features.get(key))}
   out.put("features",value)
  }
  if(content.has("clientSettings")) {
   val value=JSONObject(packaged.optJSONObject("clientSettings")?.toString()?:"{}")
   copy(content.getJSONObject("clientSettings"),value,setOf("disclaimer","privacy","about","latestVersion","updateNotes","androidUrl","iosUrl","notifyOnLaunch","forceUpdate"),base)
   for(key in setOf("androidUrl","iosUrl"))if(value.optString(key).isNotEmpty())value.put(key,media(value.getString(key),base))
   out.put("clientSettings",value)
  }
  if(content.has("announcement")) {
   val value=JSONObject(packaged.optJSONObject("announcement")?.toString()?:"{}")
   copy(content.getJSONObject("announcement"),value,setOf("enabled","text","title","image","frequency","actionLabel","page","url"),base)
   out.put("announcement",value)
  }
  if(content.has("carousel")) {
   val slides=content.getJSONObject("carousel").getJSONArray("slides");require(slides.length()<=20)
   val result=JSONArray();val seen=mutableSetOf<String>()
   for(i in 0 until slides.length()) {
    val value=JSONObject();val slide=slides.getJSONObject(i);val identifier=slide.getString("id")
    require(id.matches(identifier)&&seen.add(identifier)){"运营轮播编号无效或重复"}
    copy(slide,value,setOf("id","vodId","title","image","video","page"),base);result.put(value)
   }
   val carousel=JSONObject(packaged.optJSONObject("carousel")?.toString()?:"{}");carousel.put("slides",result);out.put("carousel",carousel)
  }
  return out
 }
}
