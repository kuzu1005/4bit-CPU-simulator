# 4bit CPU Simulator

4bit CPUの動作をシミュレーションするWebアプリです。
Assemblyモード、Binaryモード、MKTNモードに対応しています。

## できること

* Assembly(ニーモニック)でプログラムを入力
* Binaryで命令コードを入力
* 1秒ごとに1命令を実行
* Run / Stop
* PC、A、B、IN、OUT、FLAGの確認
* OUTを4つのLEDで表示
* AssemblyをBinaryに変換
* MKTNソースをAssemblyとBinaryに変換して、そのまま実行
* 周期の変更

## 使い方

1. プログラムを入力して、AssemblyまたはBinaryを選択します
3. 実行します
4. 停止します

## Assemblyの例

```
IN A
MOV B, A
ADD A, 1
OUT B
```

## Binaryの例

配列のままでも大丈夫です
```
B00100000
B01000000
B00000001
B10010000
```

## MKTNの例

```
program {
    x = in();
    if (x >= 3) {
        x = x - 1;
    } else {
        x = x + 1;
    }
    out(x);
}
```

MKTNモードは参照MKTNコンパイラ v1.20 と同じく、変数 `x`、
`in()` / `out()`、加減算、`if` / `else`、`while`、および
`> >= < <= == !=` に対応します。生成できるプログラムはCPUの
命令メモリに合わせて最大16命令です。

「変換」ボタンではプログラムを実行せずに変換結果を確認できます。
MKTNの場合は、生成されたAssemblyとArduinoへ貼り付け可能な
`byte prog[16]` 形式のBinaryを表示します。

## CPU Status

* PC: 現在のプログラムアドレス
* A: Aレジスタ
* B: Bレジスタ
* IN: 外部入力
* OUT: 外部出力
* FLAG: キャリーフラグ

## OUT LED

OUTの値を4つのLEDで表示します。

## 注意

このシミュレーターは現在開発中です。
想定していない入力をすると、正しく動作しない場合があります。
