"use strict";

const assert = require("node:assert/strict");
const { compile, MktnCompileError } = require("./mktn-compiler.js");

function values(source) {
    return compile(source).instructions.map(item => item.value);
}

function execute(program, input, maxSteps = 256) {
    const memory = [...program];
    while (memory.length < 16) memory.push(0);
    let a = 0;
    let b = 0;
    let out = 0;
    let carry = 0;
    let pc = 0;
    for (let step = 0; step < maxSteps && pc < 16; step++) {
        const word = memory[pc];
        const opcode = word >> 4;
        const immediate = word & 15;
        pc++;
        switch (opcode) {
            case 0x0: {
                const sum = a + immediate;
                a = sum & 15;
                carry = sum > 15 ? 1 : 0;
                break;
            }
            case 0x1: a = b; break;
            case 0x2: a = input & 15; break;
            case 0x3: a = immediate; break;
            case 0x4: b = a; break;
            case 0x5: {
                const sum = b + immediate;
                b = sum & 15;
                carry = sum > 15 ? 1 : 0;
                break;
            }
            case 0x6: b = input & 15; break;
            case 0x7: b = immediate; break;
            case 0x9: out = b; break;
            case 0xb: out = immediate; break;
            case 0xe: if (!carry) pc = immediate; break;
            case 0xf: pc = immediate; break;
            default: throw new Error(`unknown opcode ${opcode}`);
        }
    }
    return { a, b, out, carry, pc };
}

assert.deepEqual(
    values(`
        program {
            x = in();
            if (x >= 3) { x = x - 1; }
            else { x = x + 1; }
            out(x);
        }
    `),
    [0x60, 0x10, 0x0d, 0xe6, 0x5f, 0xf7, 0x51, 0x90],
    "参照 sample.txt と同じ機械語を生成する"
);

for (const [operator, predicate] of [
    [">", (x, y) => x > y],
    [">=", (x, y) => x >= y],
    ["<", (x, y) => x < y],
    ["<=", (x, y) => x <= y],
    ["!=", (x, y) => x !== y],
    ["==", (x, y) => x === y]
]) {
    const program = values(
        `program { x = in(); if (x ${operator} 7) { out(1); } else { out(2); } }`
    );
    for (let input = 0; input < 16; input++) {
        assert.equal(
            execute(program, input).out,
            predicate(input, 7) ? 1 : 2,
            `${input} ${operator} 7 の実行結果`
        );
    }
}

assert.deepEqual(
    values("program { x = 3; while (x != 0) { out(x); x = x - 1; } }"),
    [0x73, 0x10, 0x00, 0x0f, 0xe8, 0x90, 0x5f, 0xf1],
    "while の前方・後方ジャンプを絶対アドレスへ変換する"
);

assert.deepEqual(
    values("program { if (x < 0) { out(1); } else { out(2); } }"),
    [0xb2],
    "常に偽の条件を畳み込む"
);

assert.match(
    compile("program { x = 20; out(x); }").binary,
    /^byte prog\[16\] = \{\nB01110100,/,
    "即値は参照実装と同様に下位4bitへ丸める"
);

assert.throws(
    () => compile("program { x = in() }"),
    error => error instanceof MktnCompileError && /;/.test(error.message),
    "構文エラーに位置と不足記号を含める"
);

assert.throws(
    () => compile(`program {
        out(1); out(1); out(1); out(1); out(1); out(1);
        out(1); out(1); out(1); out(1); out(1); out(1);
        out(1); out(1); out(1); out(1); out(1);
    }`),
    /16命令/,
    "16命令を超えるプログラムを拒否する"
);

console.log("MKTN compiler tests: OK");
