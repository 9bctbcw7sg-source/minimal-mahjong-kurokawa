# GitHub Pages 公開手順

このフォルダは、`main` ブランチへ反映するとGitHub Actionsがテスト・ビルド・公開を自動実行する構成です。

## 1. GitHubに空のリポジトリを作る

1. GitHub右上の「+」から「New repository」を選ぶ。
2. Repository nameを `minimal-mahjong-kurokawa` にする。
3. Publicを選ぶ。
4. README、`.gitignore`、Licenseは追加せず、空のまま作成する。

## 2. このフォルダを送る

このフォルダはすでにGit初期化と最初のコミットまで済んでいます。ターミナルで次を実行し、`YOUR-NAME`だけ自分のGitHubユーザー名へ置き換えます。

```bash
cd "/Users/maikokubota/Codex labo/minimal-mahjong-kurokawa"
git remote add origin https://github.com/YOUR-NAME/minimal-mahjong-kurokawa.git
git push -u origin main
```

## 3. GitHub Pagesを有効にする

1. リポジトリの「Settings」を開く。
2. 左側の「Pages」を開く。
3. Build and deploymentのSourceで「GitHub Actions」を選ぶ。
4. 「Actions」タブで `Test and deploy to GitHub Pages` が緑のチェックになるまで待つ。

公開URLは通常、次の形です。

```text
https://YOUR-NAME.github.io/minimal-mahjong-kurokawa/
```

以後は `main` ブランチへpushするたびに自動更新されます。
