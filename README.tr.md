# Spotlight Clone

Windows ve macOS için, Electron ile yazılmış macOS Spotlight benzeri bir başlatıcı. Kısayola bas, yaz; uygulama, dosya ve klasör aç, hızlı hesap yap ya da web'de ara.

[English README](README.md)

## Özellikler

- Spotlight görünümü: çerçevesiz, yarı saydam arama çubuğu, açılış animasyonu, sistem temasını izleyen açık/koyu mod, Windows 11'de acrylic bulanıklık.
- İlk açılışta sistem taraması: tarama sırasında canlı ilerleme gösterilir. Sonuçlar önbelleğe alınır, sonraki açılışlar anında hazırdır.
- Taranan yerler: uygulamalar (Başlat menüsü, Microsoft Store), masaüstü ve oyun kısayolları, Masaüstü / Belgeler / İndirilenler / Resimler / Müzik / Videolar.
- Aksan ve büyük/küçük harf duyarsız bulanık arama, gruplanmış sonuçlar, gerçek ikonlar.
- Hesap makinesi (`12*8+4`), komutlar (`quit`, `rescan` / `tara`).
- Sistem tepsisinde arka planda çalışır, isteğe bağlı olarak Windows ile başlar.
- Diller: English ve Türkçe. Tepsi menüsünden değiştirilir.

## Kurulum

```bash
git clone https://github.com/<kullanici>/spotlight-clone.git
cd spotlight-clone
npm install
npm start
```

İlk açılışta çubuk kendiliğinden açılır ve sistemi tarar. Sonrasında **Alt+Space** ile açılır. Windows'ta terminalsiz başlatmak için `Spotlight-Launch.vbs` dosyasına çift tıkla.

`npm install` takılırsa: projeyi OneDrive dışında tut, gerekirse `ELECTRON_MIRROR` ayarla ya da Electron'u elle indir. Ayrıntılar [README.md](README.md) içindeki "Installation troubleshooting" bölümünde.

## Kısayollar

| Tuş | İşlev |
| --- | --- |
| `Alt+Space` | Çubuğu aç / kapat |
| `↑` / `↓` | Sonuçlarda gezin |
| `Enter` | Seçileni aç |
| `Ctrl+Enter` | Klasörde göster |
| `Alt+1` … `Alt+9` | N. sonucu aç |
| `Esc` | Aramayı temizle, sonra kapat |

Tepsi simgesine sol tıklayınca çubuk açılır, sağ tıklayınca menü çıkar: aç, yeniden tara, bilgisayarla başlat, dil, çık.

## Lisans

[MIT](LICENSE)
