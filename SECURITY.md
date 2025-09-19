# Güvenlik Politikası

Bu dosya, **Site Tweaks (Local)** Chrome uzantısının güvenlik yaklaşımını ve sınırlamalarını açıklar.

---

## 🔐 Genel Yaklaşım

- **Kullanıcı kontrolünde**: Eklenti, yalnızca kullanıcının girdiği veya içe aktardığı CSS/JS kodunu çalıştırır.  
- **Uzaktan yükleme yok**: Herhangi bir http/https kaynağından JS veya CSS dosyası çekilmez.  
- **Minimal izinler**: Yalnızca `storage`, `scripting`, `activeTab` ve `contextMenus` izinleri vardır.  
- **Manifest V3**: Background script yerine service worker kullanılır, güvenlik daha sıkı.

---

## 📝 MAIN vs ISOLATED World

- **ISOLATED (varsayılan)**: Kod içerik betiği dünyasında çalışır; sayfanın global değişkenlerine erişemez. Daha güvenlidir.  
- **MAIN**: Kod doğrudan sayfanın kendi context’inde çalışır. Bu mod sadece güvenilir kodlar için kullanılmalıdır.

---

## 🗂 Yerel JS Dosyaları

- Chrome güvenlik politikası nedeniyle **doğrudan disk yoluna** erişilemez.  
- JS dosyaları Options sayfasından içe aktarılır, içerik eklentinin storage’ında saklanır.  
- (Mümkünse) File System Access API handle’ı saklanarak “Diskten yenile” butonuyla içerik güncellenebilir.  
- Kullanıcı onayı olmadan hiçbir yerel dosyaya tekrar erişim sağlanmaz.

---

## 🛑 Kritik Domain / Blok Listesi

- Kullanıcı Options sayfasından kritik domainler veya desenler belirleyerek buralarda **hiçbir enjeksiyon yapılmamasını** sağlayabilir.  
- Böylece banka/ödemeler gibi hassas sayfalar güven altında tutulabilir.

---

## 📜 Güvenlik Tavsiyeleri

1. **Güvendiğiniz kodu çalıştırın.** MAIN modda özellikle dikkatli olun.  
2. **Kritik sitelerde** (bankacılık, ödeme, sağlık) kural tanımlamaktan kaçının veya safeMode’u kullanın.  
3. **Uzaktan kaynaklara** (örneğin CDN’den JS) ihtiyaç duyarsanız dosyayı indirip eklentiye dahil edin.  
4. **Export ettiğiniz ayarları** paylaşmadan önce içeriğindeki JS/CSS kodlarının hassas bilgi içermediğini doğrulayın.

---

## 🐞 Güvenlik Açığı Bildirimi

Bu proje kişisel kullanım için geliştirilmiştir. Resmi bir güvenlik destek hattı yoktur.  
Yine de bir güvenlik açığı bulursanız GitHub Issues üzerinden bildirebilirsiniz.

---

## 📜 Lisans ve Feragat

Bu proje **kamu malıdır** (Unlicense). Kodun kullanımından doğabilecek sonuçlar tamamen kullanıcı sorumluluğundadır.
