# Zakupy RM

PWA zakupów biura (zbudowana 27.10.2026). Zapasy sprawdzamy w każdą środę.

- **📝 Sprawdzamy:** lista produktów pogrupowana kategoriami. Klik w produkt = trzeba kupić, licznik − / + ustawia ile. Pole na górze dopisuje produkt „📌 na stałe” (wraca co środę) albo „tylko tym razem” (znika po zakupach). „⋯” przy produkcie: nazwa, kategoria, jednostka, ile zwykle, uwagi, zmiana stały/jednorazowy, usunięcie ze stałych. Na dole: 🖨️ Drukuj listę albo 🛒 Do kupienia.
- **🛒 Do kupienia:** lista do odhaczania w sklepie, pasek postępu. Po zakupach kwota całościowa z paragonu, sklep, data, uwagi i „Zakończ zakupy”: kupione idą do archiwum, stałe wracają do „nie trzeba” z ilością domyślną, jednorazowe znikają, nieodhaczone zostają na liście.
- **📦 Archiwum:** zakupy pogrupowane miesiącami z sumą, kafle (ten miesiąc, poprzedni, średnio na zakupy z 3 miesięcy), co kupiono, „Zaznacz te pozycje do kupienia”, poprawa kwoty; wpis usuwa tylko menedżer.
- **Wydruk:** A4 z logo, kratki ☐, ilości, 3 wolne linie na dopisanie, miejsce na sklep, kwotę i podpis.

Dane w bazie Zadań RM (Supabase `zadania-rm`), to samo logowanie, tabele `zakupy_produkty` i `zakupy_archiwum` + funkcja `zakupy_zakoncz` z `setup.sql` (13 produktów stałych z listy Rafała z 27.10.2026). Tryb próbny: `index.html?proba`.
Wydanie: podbij `WERSJA` w app.js, `?v=` w index.html i `CACHE` w sw.js, potem `bash publikuj.sh "opis"`.
