# 退役した女性向けサンプル

更新意図: 公開クローゼットをメンズ向けへ揃えるため、表示対象から女性向けサンプル7点を除外。削除せず、画像と元定義を復元可能な形で退避する。処理日時: 2026-09-30 JST

元の場所はすべて `assets/samples/` です。

| 旧ID | 名称 | 退避画像 |
| --- | --- | --- |
| `sample-bottoms-04` | オリーブのミディスカート | `bottoms-04.jpg` |
| `sample-onepiece-01` | クリームのシャツワンピース | `onepiece-01.jpg` |
| `sample-onepiece-02` | ネイビーのミディワンピース | `onepiece-02.jpg` |
| `sample-onepiece-03` | テラコッタのカジュアルワンピース | `onepiece-03.jpg` |
| `sample-onepiece-04` | 黒のフォーマルワンピース | `onepiece-04.jpg` |
| `sample-onepiece-05` | セージグリーンのリネンワンピース | `onepiece-05.jpg` |
| `sample-shoes-04` | ベージュのフラットサンダル | `shoes-04.jpg` |

アプリは起動時に上記IDのうち `isSample: true` のレコードだけをIndexedDBから除外します。利用者が自分で登録した服と評価履歴には触れません。
