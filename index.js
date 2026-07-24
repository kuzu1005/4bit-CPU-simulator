class Register {
    constructor() {
        this.value = Math.floor(Math.random() * 16);
    }

    update(input, signal) {
        if (signal === 0) this.value = input;
    }

    get() { return this.value; }

    set(x) { this.value = x; }
}


class Mux {
    select(A, B, IN, D0, D1) {
        if (D1 === 0)
            return D0 === 0 ? A : B;

        return D0 === 0 ? IN : 0;
    }
}


class FullAdder {
    constructor() {
        this.FLAG = Math.floor(Math.random() * 2);
    }

    add(X, D) {
        const result = X + D;

        if (result < 16) {
            this.FLAG = 0;
            return result;
        }

        this.FLAG = 1;
        return result & 15;
    }

    getF() { return this.FLAG; }
}


class Decoder {
    decode(D4, D5, D6, D7, FLAG) {
        this.SA = D6 | D7;
        this.SB = this.not(D6) | D7;
        this.SC = this.not(this.not(D6) & D7);
        this.SD0 = D4 | D7;
        this.SD1 = D5;
        this.SE = this.not((this.not(FLAG) | D4) & D6 & D7);
    }

    not(value) { return value === 0 ? 1 : 0; }
}


let instructions = [];

let IN = 0;
let PC = 0;

let ID = new Decoder();
let FA = new FullAdder();
let MUX = new Mux();

let A = new Register();
let B = new Register();
let Out = new Register();

let isPlaying = false;
let timer = null;
let inputMode = "assembly";

const programInput = document.getElementById("programInput");
const inInput = document.getElementById("inInput");

const runButton = document.getElementById("run");
const convertButton = document.getElementById("convert");
const stopButton = document.getElementById("stop");

const message = document.getElementById("message");

const pcValue = document.getElementById("pcValue");
const aValue = document.getElementById("aValue");
const bValue = document.getElementById("bValue");
const inValue = document.getElementById("inValue");
const outValue = document.getElementById("outValue");
const flagValue = document.getElementById("flagValue");

const outLed3 = document.getElementById("outLed3");
const outLed2 = document.getElementById("outLed2");
const outLed1 = document.getElementById("outLed1");
const outLed0 = document.getElementById("outLed0");

const assemblyModeButton = document.getElementById("assemblyMode");
const binaryModeButton = document.getElementById("binaryMode");
const mktnModeButton = document.getElementById("mktnMode");

const cycleInput = document.getElementById("cycleInput");
const pcLoopMode = document.getElementById("pcLoopMode");

const binaryOutput = document.getElementById("binaryOutput");
const copyBinaryButton = document.getElementById("copyBinaryButton");
const binaryMessage = document.getElementById("binaryMessage");
const conversionTitle = document.getElementById("conversionTitle");
const mktnOutputOptions = document.getElementById("mktnOutputOptions");
const mktnOutputFormat = document.getElementById("mktnOutputFormat");

let lastMktnCompilation = null;

function showMktnOutput(compiled) {
    if (!compiled) return;

    binaryOutput.value = mktnOutputFormat.value === "machine"
        ? compiled.binary
        : compiled.assembly;
}

function updateDisplay() {
    pcValue.textContent = PC;
    aValue.textContent = A.get();
    bValue.textContent = B.get();
    inValue.textContent = IN;
    inInput.value = IN;
    outValue.textContent = Out.get();
    flagValue.textContent = FA.getF();

    const output = Out.get();

    outLed3.classList.toggle("on", (output & 8) !== 0);
    outLed2.classList.toggle("on", (output & 4) !== 0);
    outLed1.classList.toggle("on", (output & 2) !== 0);
    outLed0.classList.toggle("on", (output & 1) !== 0);
}


function operate(instruction) {
    IN = Number(inInput.value) & 15;

    const D = instruction & 15;

    const D4 = (instruction >> 4) & 1;
    const D5 = (instruction >> 5) & 1;
    const D6 = (instruction >> 6) & 1;
    const D7 = (instruction >> 7) & 1;

    ID.decode(D4, D5, D6, D7, FA.getF());

    const X = MUX.select(A.get(), B.get(), IN, ID.SD0, ID.SD1);

    const result = FA.add(X, D);

    A.update(result, ID.SA);
    B.update(result, ID.SB);
    Out.update(result, ID.SC);

    //console.log(instruction, FA.getF(), ID.SA, ID.SB, ID.SC, ID.SD1, ID.SD0, ID.SE);
    PC = (ID.SE === 1) ? PC + 1 : D;

    updateDisplay();
}

function resetState() {
    A.set(0);
    B.set(0);
    Out.set(0);
    PC = 0;
}

function convertProgram(text) {
    try {
        if (inputMode === "assembly") {
            const assembled = assemble(text);

            instructions = assembled.map(item => item.instruction);

            binaryOutput.value = assemblyToBinary(assembled);
            binaryMessage.textContent = "";
        } else if (inputMode === "mktn") {
            const compiled = MktnCompiler.compile(text);
            lastMktnCompilation = compiled;
            instructions = compiled.instructions.map(item => item.value);
            showMktnOutput(compiled);
            binaryMessage.textContent = compiled.warnings.join(" ");
        } else {
            instructions = parseBinary(text);
            binaryOutput.value = instructions
                .map(instructionToBinary)
                .join("\n");
            binaryMessage.textContent = "";
        }
    } catch (error) {
        if (inputMode === "mktn") lastMktnCompilation = null;
        instructions = [];
        message.textContent = error.message;
        binaryMessage.textContent = "変換に失敗しました";
        return false;
    }

    if (instructions.length === 0) {
        message.textContent = "プログラムが見つかりません";
        return false;
    }
    message.textContent = `${instructions.length}命令に変換しました`;
    return true;
}

convertButton.addEventListener("click", () => {
    convertProgram(programInput.value);
});

mktnOutputFormat.addEventListener("change", () => {
    showMktnOutput(lastMktnCompilation);
});

runButton.addEventListener("click", () => {
    if (isPlaying) {
        message.textContent = "実行中です";
        return;
    }

    const cycle = Math.max(1, Math.min(1000, cycleInput.value));
    cycleInput.value = cycle;

    if (!convertProgram(programInput.value)) return;

    fillInstructions(instructions);

    console.log(instructions);
    resetState();
    isPlaying = true;

    message.textContent = "実行中";

    timer = setInterval(() => {
        if (PC >= 16) {
            if (pcLoopMode.checked) {
                PC = 0;
            } else {
                clearInterval(timer);
                timer = null;
                isPlaying = false;
                message.textContent = "プログラムが終了しました";
                return;
            }
        }

        operate(instructions[PC]);
    }, cycle);
});


stopButton.addEventListener("click", () => {
    if (!isPlaying)
        return;

    clearInterval(timer);

    timer = null;
    isPlaying = false;

    message.textContent = "停止しました";
});


function fillInstructions(instructions) {
    while (instructions.length < 16) {
        instructions.push(0);
    }

    return instructions;
}


// アセンブリとバイナリの切り替え
assemblyModeButton.addEventListener("click", () => {
    inputMode = "assembly";

    assemblyModeButton.classList.add("active");
    binaryModeButton.classList.remove("active");
    mktnModeButton.classList.remove("active");

    programInput.placeholder = "例:\nIN A\nADD A, 1\nOUT B";
    conversionTitle.textContent = "Assembly → Binary";
    mktnOutputOptions.hidden = true;
});

binaryModeButton.addEventListener("click", () => {
    inputMode = "binary";

    binaryModeButton.classList.add("active");
    assemblyModeButton.classList.remove("active");
    mktnModeButton.classList.remove("active");

    programInput.placeholder = "例:\nB00100000\nB00000001\nB10010000";
    conversionTitle.textContent = "Binary";
    mktnOutputOptions.hidden = true;
});

mktnModeButton.addEventListener("click", () => {
    inputMode = "mktn";

    mktnModeButton.classList.add("active");
    assemblyModeButton.classList.remove("active");
    binaryModeButton.classList.remove("active");

    programInput.placeholder = "例:\nprogram {\n  x = in();\n  x = x + 1;\n  out(x);\n}";
    conversionTitle.textContent = "MKTN Compiler";
    mktnOutputOptions.hidden = false;
});


// アセンブリのコード読み取り
function assemble(text) {

    return text
        .split("\n")
        .map(line => line.trim())
        .filter(line => line !== "")
        .map(line => {

            const instruction = assembleLine(line);

            if (instruction === null) {
                return null;
            }

            return {
                instruction: instruction,
                source: line
            };

        })
        .filter(item => item !== null);

}

function assembleLine(line) {
    const parts = line.trim().split(/[\s,]+/);
    const command = parts[0];
    const operand1 = parts[1];
    const operand2 = parts[2];

    console.log(command, operand1, operand2);
    if (command === "MOV" && operand1 === "A") {
        if (operand2 === "B")
            return parseInt("00010000", 2);

        const immediate = Number(operand2);

        return parseInt(
            "0011" + immediate.toString(2).padStart(4, "0"),
            2
        );
    }

    if (command === "MOV" && operand1 === "B") {
        if (operand2 === "A")
            return parseInt("01000000", 2);

        const immediate = Number(operand2);

        return parseInt(
            "0111" + immediate.toString(2).padStart(4, "0"),
            2
        );
    }

    if (command === "ADD") {
        const immediate = Number(operand2);
        if (operand1 === "A") {
            return parseInt(
                "0000" + immediate.toString(2).padStart(4, "0"),
                2
            );
        }
        if (operand1 === "B") {
            return parseInt(
                "0101" + immediate.toString(2).padStart(4, "0"),
                2
            );
        }
    }
    if (command === "IN") {
        if (operand1 === "A") return parseInt("00100000", 2);
        if (operand1 === "B") return parseInt("01100000", 2);
    }

    if (command === "OUT") {
        if (operand1 === "B") {
            return parseInt("10010000", 2);
        }
        const immediate = Number(operand1);
        return parseInt(
            "1011" + immediate.toString(2).padStart(4, "0"),
            2
        );
    }

    if (command === "JMP") {
        const immediate = Number(operand1);
        return parseInt(
            "1111" + immediate.toString(2).padStart(4, "0"),
            2
        );
    }
    if (command === "JNC") {
        const immediate = Number(operand1);
        return parseInt(
            "1110" + immediate.toString(2).padStart(4, "0"),
            2
        );
    }

    return null;
}

// バイナリーのコード読み取り
function parseBinary(text) {
    return (text.match(/B[01]{8}/g) || [])
        .map(binary => parseInt(binary.substring(1), 2));
}

// アセンブリのコードをバイナリに変換
function instructionToBinary(instruction) {
    return "B" + instruction
        .toString(2)
        .padStart(8, "0");
}


function assemblyToBinary(assembled) {

    const lines = assembled.map((item, index) => {

        const binary = instructionToBinary(item.instruction);

        const address = index.toString(2).padStart(4, "0");

        return `${binary}, // ADDR ${address} : ${item.source}`;

    });

    while (lines.length < 16) {

        const address =
            lines.length
                .toString(2)
                .padStart(4, "0");

        lines.push(
            `B00000000, // ADDR ${address} : ADD A, 0`
        );

    }

    return lines.join("\n");

}

copyBinaryButton.addEventListener("click", async () => {

    if (binaryOutput.value === "") {

        binaryMessage.textContent =
            "コピーするBinaryがありません";

        return;
    }

    await navigator.clipboard.writeText(
        binaryOutput.value
    );

    binaryMessage.textContent =
        "変換結果をコピーしました";
});
