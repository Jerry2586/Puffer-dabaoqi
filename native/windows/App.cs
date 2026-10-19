using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Hetun;
public class ClientApp : Application {
 [STAThread] public static void Main() { new ClientApp().Run(new MainWindow()); }
}
public class MainWindow : Window {
 readonly JsonObject config = Read("runtime.json");
 readonly JsonObject theme = (JsonObject)Read("manifest.json")["theme"]!;
 readonly HttpClient http = new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(20) };
 readonly StackPanel body = new();
 string token = "";
 int revision;
 Brush foreground = Brushes.White;
 static JsonObject Read(string name) { var a = Assembly.GetExecutingAssembly(); using var stream = a.GetManifestResourceStream(a.GetManifestResourceNames().Single(n => n.EndsWith(".assets." + name))); return JsonNode.Parse(stream!)!.AsObject(); }
 static string S(JsonNode? n, string key, string fallback = "") => n?[key]?.ToString() ?? fallback;
 Brush Color(string key, string fallback) { try { return (Brush)new BrushConverter().ConvertFromString(S(theme["colors"], key, fallback))!; } catch { return Brushes.White; } }
 public MainWindow() {
  Title = S(config,"name"); Width = 1180; Height = 800; MinWidth = 720; MinHeight = 480;
  Background = Color("background", "#101014"); foreground = Color("text", "#f4f4f4"); Foreground = foreground;
  var root = new DockPanel { Margin = new Thickness(24) }; Content = root;
  var heading = new TextBlock { Text = Title, FontSize = 30, Foreground = Color("accent", "#27c9e3"), Margin = new Thickness(0,0,0,20) }; DockPanel.SetDock(heading, Dock.Top); root.Children.Add(heading);
  var nav = new WrapPanel(); DockPanel.SetDock(nav, Dock.Bottom); root.Children.Add(nav);
  foreach (var item in theme["navigation"]?.AsArray() ?? new()) if (S(item,"enabled","true") != "false") nav.Children.Add(Button(S(item,"label"), () => Page(S(item,"page","home"), S(item,"categoryId"))));
  root.Children.Add(new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }); Closed += (_,_) => http.Dispose(); Page("home");
 }
 Button Button(string title, Action action) { var b = new Button { Content = title, Padding = new Thickness(16,10,16,10), Margin = new Thickness(4), FontSize = 16 }; b.Click += (_,_) => action(); return b; }
 void Text(string value, double size = 18) => body.Children.Add(new TextBlock { Text = value, FontSize = size, Foreground = foreground, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(4,12,4,12) });
 async Task<JsonObject> Request(string route, JsonObject? payload = null) {
  var baseUrl = S(config,"apiBase"); if (!baseUrl.StartsWith("https://")) throw new Exception("尚未配置 HTTPS 影视中心，当前为离线主题预览。");
  using var request = new HttpRequestMessage(payload == null ? HttpMethod.Get : HttpMethod.Post, baseUrl + route);
  if (token.Length > 0) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
  if (payload != null) request.Content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
  using var response = await http.SendAsync(request); var data = JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();
  if (!response.IsSuccessStatusCode) throw new Exception(S(data,"error","影视接口响应失败")); return data;
 }
 async Task Guard(Func<Task> action) { try { await action(); } catch (Exception e) { MessageBox.Show(this,e.Message,"河豚"); } }
 void Page(string page, string category = "") {
  ++revision; body.Children.Clear();
  if (S(theme["announcement"],"enabled") == "true") Text(S(theme["announcement"],"text"));
  if (page is "member" or "mine") { Account(); return; }
  if (page == "schedule") { Text("排期表",26); Text(theme["schedule"]?.ToJsonString() ?? "暂无排期"); return; }
  var searchRow = new DockPanel(); var search = new TextBox { MinWidth = 240, FontSize = 18, Margin = new Thickness(4) }; searchRow.Children.Add(Button("搜索",()=> { ++revision; body.Children.Clear(); Catalog("/api/catalog?page=1&keyword=" + Uri.EscapeDataString(search.Text)); })); searchRow.Children.Add(search); body.Children.Add(searchRow);
  var categories = new WrapPanel(); body.Children.Add(categories); foreach (var item in theme["categories"]?.AsArray() ?? new()) if (S(item,"enabled","true") != "false") categories.Children.Add(Button(S(item,"label"),()=>Page("category",S(item,"categoryId"))));
  if (S(config,"apiBase").Length == 0) Text("离线主题预览 · 配置影视中心后加载影片");
  if (page != "home") { Text(page == "ranking" ? "排行榜" : "影片",24); Catalog("/api/catalog?page=1&category="+Uri.EscapeDataString(category)); return; }
  foreach (var s in theme["sections"]?.AsArray() ?? new()) {
   if (S(s,"enabled","true") == "false" || S(s,"page","home") != "home") continue;
   Text(S(s,"title"),24); var list = new WrapPanel(); body.Children.Add(list);
   if (S(config,"apiBase").Length == 0) { list.Children.Add(new TextBlock { Text = "主题栏目 · " + S(s,"style"), Foreground = foreground }); continue; }
   var limit = int.TryParse(S(s,"limit"), out var n) ? n : 6;
   Fetch("/api/catalog?page=1&category="+Uri.EscapeDataString(S(s,"categoryId"))+"&ids="+Uri.EscapeDataString(S(s,"manualIds")),list,limit);
  }
 }
 void Catalog(string route) { var list = new WrapPanel(); body.Children.Add(list); if (S(config,"apiBase").Length>0) Fetch(route,list,60); }
 async void Fetch(string route, WrapPanel list, int limit) {
  var stamp = revision;
  await Guard(async()=> { var data = await Request(route); if (stamp != revision) return;
   foreach (var item in (data["items"]?.AsArray() ?? new()).Take(limit)) {
    var card = new StackPanel { Width = 180, Margin = new Thickness(8) }; var poster = S(item,"poster");
    if (poster.StartsWith("https://")) { try { card.Children.Add(new Image { Source = new BitmapImage(new Uri(poster)), Height=235, Stretch=Stretch.UniformToFill }); } catch {} }
    card.Children.Add(Button(S(item,"title")+"\n"+S(item,"note"),()=>Detail(item!))); list.Children.Add(card);
   }
  });
 }
 void Detail(JsonNode item) {
  ++revision; body.Children.Clear(); Text(S(item,"title"),28); Text(S(item,"description")); body.Children.Add(Button("返回首页",()=>Page("home")));
  var sources = item["sources"]?.AsArray() ?? new();
  for (int sid=0; sid<sources.Count; sid++) { var source=sources[sid]; Text(S(source,"name")); var episodes=source?["episodes"]?.AsArray() ?? new();
   for (int nid=0;nid<episodes.Count;nid++) { int s=sid+1,n=nid+1; body.Children.Add(Button(S(episodes[nid],"name"),()=>_ = Guard(async()=> {
    var result=await Request("/api/playback",new JsonObject { ["id"]=item["id"]!.DeepClone(), ["sid"]=s, ["nid"]=n }); var url=S(result,"url"); if (!url.StartsWith("https://")) throw new Exception("播放地址必须为 HTTPS");
    ++revision; body.Children.Clear(); var player=new MediaElement { Source=new Uri(url), Height=500, LoadedBehavior=MediaState.Manual, UnloadedBehavior=MediaState.Stop }; body.Children.Add(player); player.Play(); body.Children.Add(Button("暂停",()=>player.Pause())); body.Children.Add(Button("播放",()=>player.Play())); body.Children.Add(Button("返回详情",()=> { player.Stop(); Detail(item); }));
   }))); }
  }
 }
 void Account() {
  Text("会员中心",26); var username=new TextBox { FontSize=18,Margin=new Thickness(4) }; var password=new PasswordBox { FontSize=18,Margin=new Thickness(4) }; body.Children.Add(username); body.Children.Add(password);
  body.Children.Add(Button("登录",()=>_ = Guard(async()=> { var data=await Request("/api/member/login",new JsonObject { ["username"]=username.Text,["password"]=password.Password }); token=S(data,"token"); body.Children.Clear(); Text("登录成功"); Text(data["profile"]?.ToJsonString() ?? ""); body.Children.Add(Button("退出登录",()=>_ = Guard(async()=> { await Request("/api/member/logout",new JsonObject()); token=""; Page("member"); }))); })));
 }
}
