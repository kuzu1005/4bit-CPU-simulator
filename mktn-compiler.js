(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.MktnCompiler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const OP = Object.freeze({
        MOV_A_IM: 0x30, MOV_B_IM: 0x70, MOV_A_B: 0x10, MOV_B_A: 0x40,
        ADD_A_IM: 0x00, ADD_B_IM: 0x50, IN_A: 0x20, IN_B: 0x60,
        OUT_IM: 0xb0, OUT_B: 0x90, JMP: 0xf0, JNC: 0xe0
    });

    const COND = Object.freeze({
        CARRY_TRUE: 0, CARRY_FALSE: 1, NE: 2, EQ: 3,
        ALWAYS_TRUE: 4, ALWAYS_FALSE: 5
    });

    class MktnCompileError extends Error {
        constructor(message, token) {
            const location = token ? `${token.line}行${token.column}列: ` : "";
            super(location + message);
            this.name = "MktnCompileError";
            this.line = token ? token.line : null;
            this.column = token ? token.column : null;
        }
    }

    function tokenize(source) {
        const tokens = [];
        let offset = 0;
        let line = 1;
        let column = 1;
        const keywords = new Set(["program", "if", "else", "while", "in", "out", "x"]);

        function advance(text) {
            for (const ch of text) {
                if (ch === "\n") {
                    line++;
                    column = 1;
                } else {
                    column++;
                }
            }
            offset += text.length;
        }

        while (offset < source.length) {
            const rest = source.slice(offset);
            const whitespace = rest.match(/^\s+/);
            if (whitespace) {
                advance(whitespace[0]);
                continue;
            }
            const comment = rest.match(/^\/\/[^\n]*/);
            if (comment) {
                advance(comment[0]);
                continue;
            }

            const tokenLine = line;
            const tokenColumn = column;
            const number = rest.match(/^\d+/);
            if (number) {
                tokens.push({ type: "NUMBER", value: Number(number[0]), line, column });
                advance(number[0]);
                continue;
            }
            const word = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (word) {
                if (!keywords.has(word[0])) {
                    throw new MktnCompileError(`未定義の識別子「${word[0]}」です`, {
                        line: tokenLine, column: tokenColumn
                    });
                }
                tokens.push({ type: word[0], value: word[0], line, column });
                advance(word[0]);
                continue;
            }
            const operator = rest.match(/^(>=|<=|!=|==|[(){};+\-=<>])/);
            if (operator) {
                tokens.push({ type: operator[0], value: operator[0], line, column });
                advance(operator[0]);
                continue;
            }
            throw new MktnCompileError(`解釈できない文字「${rest[0]}」です`, {
                line: tokenLine, column: tokenColumn
            });
        }
        tokens.push({ type: "EOF", value: "", line, column });
        return tokens;
    }

    class Parser {
        constructor(tokens) {
            this.tokens = tokens;
            this.position = 0;
        }

        current() { return this.tokens[this.position]; }
        at(type) { return this.current().type === type; }

        take(type, description) {
            const token = this.current();
            if (token.type !== type) {
                throw new MktnCompileError(
                    `${description || `「${type}」`}が必要です（現在: ${displayToken(token)}）`,
                    token
                );
            }
            this.position++;
            return token;
        }

        parse() {
            if (this.at("EOF")) return { type: "Program", body: [] };
            this.take("program", "「program」");
            const body = this.parseBlock();
            this.take("EOF", "プログラムの終端");
            return { type: "Program", body };
        }

        parseBlock() {
            this.take("{", "「{」");
            const statements = [];
            while (!this.at("}") && !this.at("EOF")) statements.push(this.parseStatement());
            this.take("}", "「}」");
            return statements;
        }

        parseStatement() {
            if (this.at(";")) {
                this.take(";");
                return { type: "Empty" };
            }
            if (this.at("x")) {
                this.take("x");
                this.take("=", "代入の「=」");
                if (this.at("in")) {
                    this.take("in");
                    this.take("(");
                    this.take(")");
                    this.take(";");
                    return { type: "Input" };
                }
                const expression = this.parseExpression();
                this.take(";", "文末の「;」");
                return { type: "Assign", expression };
            }
            if (this.at("out")) {
                this.take("out");
                this.take("(");
                const expression = this.parseExpression();
                this.take(")");
                this.take(";", "文末の「;」");
                return { type: "Output", expression };
            }
            if (this.at("if")) {
                this.take("if");
                this.take("(");
                const condition = this.parseCondition();
                this.take(")");
                const thenBody = this.parseBlock();
                const elseBody = this.at("else")
                    ? (this.take("else"), this.parseBlock())
                    : null;
                return { type: "If", condition, thenBody, elseBody };
            }
            if (this.at("while")) {
                this.take("while");
                this.take("(");
                const condition = this.parseCondition();
                this.take(")");
                return { type: "While", condition, body: this.parseBlock() };
            }
            throw new MktnCompileError("文を解釈できません", this.current());
        }

        parseCondition() {
            this.take("x", "条件式左辺の「x」");
            const operator = this.current();
            if (![">", ">=", "<", "<=", "!=", "=="].includes(operator.type)) {
                throw new MktnCompileError("比較演算子が必要です", operator);
            }
            this.position++;
            return { operator: operator.type, expression: this.parseExpression(), token: operator };
        }

        parseExpression() {
            let expression = this.parseImmediate();
            while (this.at("+") || this.at("-")) {
                const operator = this.current().type;
                this.position++;
                expression = {
                    type: "BinaryExpression", operator,
                    left: expression, right: this.parseImmediate()
                };
            }
            return expression;
        }

        parseImmediate() {
            if (this.at("NUMBER")) {
                const token = this.take("NUMBER");
                return { type: "Number", value: token.value, token };
            }
            if (this.at("x")) {
                const token = this.take("x");
                return { type: "Variable", token };
            }
            throw new MktnCompileError("数値または「x」が必要です", this.current());
        }
    }

    function displayToken(token) {
        return token.type === "EOF" ? "入力の終端" : `「${token.value}」`;
    }

    function evaluateExpression(node) {
        if (node.type === "Number") return { value: node.value, hasVariable: false };
        if (node.type === "Variable") return { value: 0, hasVariable: true };
        const left = evaluateExpression(node.left);
        const right = evaluateExpression(node.right);
        return {
            value: node.operator === "+" ? left.value + right.value : left.value - right.value,
            hasVariable: left.hasVariable || right.hasVariable
        };
    }

    function instruction(op, immediate, relative) {
        return { op, immediate: immediate == null ? null : immediate, relative: Boolean(relative) };
    }

    function normalizeNibble(value) {
        return ((value % 16) + 16) % 16;
    }

    function compileCondition(node, warnings) {
        const value = evaluateExpression(node.expression).value;
        const warning = kind => {
            warnings.push(`条件式「x ${node.operator} ${value}」は常に${kind === COND.ALWAYS_TRUE ? "真" : "偽"}です。`);
            return { kind, code: [] };
        };
        switch (node.operator) {
            case ">":
                if (value < 0) return warning(COND.ALWAYS_TRUE);
                if (value >= 15) return warning(COND.ALWAYS_FALSE);
                return { kind: COND.CARRY_TRUE, code: [instruction(OP.ADD_A_IM, 16 - value - 1)] };
            case ">=":
                if (value <= 0) return warning(COND.ALWAYS_TRUE);
                if (value >= 16) return warning(COND.ALWAYS_FALSE);
                return { kind: COND.CARRY_TRUE, code: [instruction(OP.ADD_A_IM, 16 - value)] };
            case "<":
                if (value <= 0) return warning(COND.ALWAYS_FALSE);
                if (value >= 16) return warning(COND.ALWAYS_TRUE);
                return { kind: COND.CARRY_FALSE, code: [instruction(OP.ADD_A_IM, 16 - value)] };
            case "<=":
                if (value >= 15) return warning(COND.ALWAYS_TRUE);
                if (value < 0) return warning(COND.ALWAYS_FALSE);
                return { kind: COND.CARRY_FALSE, code: [instruction(OP.ADD_A_IM, 16 - value - 1)] };
            case "!=":
                if (value < 0 || value > 15) return warning(COND.ALWAYS_TRUE);
                return { kind: COND.NE, code: [instruction(OP.ADD_A_IM, 16 - value)] };
            case "==":
                if (value < 0 || value > 15) return warning(COND.ALWAYS_FALSE);
                return { kind: COND.EQ, code: [instruction(OP.ADD_A_IM, value === 0 ? 0 : 16 - value)] };
            default:
                throw new MktnCompileError("未対応の比較演算子です", node.token);
        }
    }

    function conditionPrelude(condition) {
        const code = [instruction(OP.MOV_A_B), ...condition.code];
        if (condition.kind === COND.NE || condition.kind === COND.EQ) {
            code.push(instruction(OP.ADD_A_IM, 15));
        }
        return code;
    }

    function compileStatements(statements, warnings) {
        return statements.flatMap(statement => compileStatement(statement, warnings));
    }

    function compileStatement(node, warnings) {
        if (node.type === "Empty") return [];
        if (node.type === "Input") return [instruction(OP.IN_B)];
        if (node.type === "Output") {
            const expression = evaluateExpression(node.expression);
            if (expression.hasVariable) return [instruction(OP.OUT_B)];
            if (expression.value < 0) throw new MktnCompileError("OUT の即値を負数にはできません");
            return [instruction(OP.OUT_IM, expression.value)];
        }
        if (node.type === "Assign") {
            const expression = evaluateExpression(node.expression);
            if (expression.hasVariable) {
                return [instruction(OP.ADD_B_IM, normalizeNibble(expression.value))];
            }
            if (expression.value < 0) throw new MktnCompileError("代入する即値を負数にはできません");
            return [instruction(OP.MOV_B_IM, expression.value)];
        }
        if (node.type === "If") {
            const condition = compileCondition(node.condition, warnings);
            const thenCode = compileStatements(node.thenBody, warnings);
            const elseCode = node.elseBody ? compileStatements(node.elseBody, warnings) : null;
            if (condition.kind === COND.ALWAYS_TRUE) return thenCode;
            if (condition.kind === COND.ALWAYS_FALSE) return elseCode || [];
            const code = conditionPrelude(condition);
            const carryMeansTrue = condition.kind === COND.CARRY_TRUE || condition.kind === COND.NE;
            if (elseCode === null) {
                if (carryMeansTrue) return [...code, instruction(OP.JNC, thenCode.length, true), ...thenCode];
                return [
                    ...code, instruction(OP.JNC, 1, true),
                    instruction(OP.JMP, thenCode.length, true), ...thenCode
                ];
            }
            if (carryMeansTrue) {
                return [
                    ...code, instruction(OP.JNC, thenCode.length + 1, true), ...thenCode,
                    instruction(OP.JMP, elseCode.length, true), ...elseCode
                ];
            }
            return [
                ...code, instruction(OP.JNC, elseCode.length + 1, true), ...elseCode,
                instruction(OP.JMP, thenCode.length, true), ...thenCode
            ];
        }
        if (node.type === "While") {
            const condition = compileCondition(node.condition, warnings);
            const body = compileStatements(node.body, warnings);
            if (condition.kind === COND.ALWAYS_FALSE) return [];
            if (condition.kind === COND.ALWAYS_TRUE) {
                return [...body, instruction(OP.JMP, -(body.length + 1), true)];
            }
            const code = conditionPrelude(condition);
            const carryMeansTrue = condition.kind === COND.CARRY_TRUE || condition.kind === COND.NE;
            if (carryMeansTrue) {
                code.push(instruction(OP.JNC, body.length + 1, true), ...body);
            } else {
                code.push(
                    instruction(OP.JNC, 1, true),
                    instruction(OP.JMP, body.length + 1, true),
                    ...body
                );
            }
            code.push(instruction(OP.JMP, -(code.length + 1), true));
            return code;
        }
        throw new MktnCompileError(`未対応の構文「${node.type}」です`);
    }

    function resolveInstructions(code) {
        if (code.length > 16) {
            throw new MktnCompileError(
                `プログラムが命令メモリの上限（16命令）を超えています（${code.length}命令）`
            );
        }
        return code.map((item, address) => {
            let immediate = item.immediate;
            if (item.relative) immediate = immediate + address + 1;
            const value = item.op | (immediate == null ? 0 : normalizeNibble(immediate));
            return {
                ...item,
                address,
                immediate: immediate == null ? null : normalizeNibble(immediate),
                value
            };
        });
    }

    function mnemonic(item) {
        const im = item.immediate;
        switch (item.op) {
            case OP.MOV_A_IM: return `MOV A, ${im}`;
            case OP.MOV_B_IM: return `MOV B, ${im}`;
            case OP.MOV_A_B: return "MOV A, B";
            case OP.MOV_B_A: return "MOV B, A";
            case OP.ADD_A_IM: return `ADD A, ${im}`;
            case OP.ADD_B_IM: return `ADD B, ${im}`;
            case OP.IN_A: return "IN A";
            case OP.IN_B: return "IN B";
            case OP.OUT_IM: return `OUT ${im}`;
            case OP.OUT_B: return "OUT B";
            case OP.JMP: return `JMP ${im}`;
            case OP.JNC: return `JNC ${im}`;
            default: throw new Error("unknown opcode");
        }
    }

    function instructionToBinary(value) {
        return "B" + value.toString(2).padStart(8, "0");
    }

    function formatBinary(instructions, includeWrapper) {
        const padded = [...instructions];
        while (padded.length < 16) {
            padded.push({ address: padded.length, value: 0, op: OP.ADD_A_IM, immediate: 0 });
        }
        const lines = padded.map((item, index) => {
            const comma = index < 15 ? "," : " ";
            const address = index.toString(2).padStart(4, "0");
            return `${instructionToBinary(item.value)}${comma} // ADDR ${address} : ${mnemonic(item)}`;
        });
        return includeWrapper === false ? lines.join("\n") : `byte prog[16] = {\n${lines.join("\n")}\n};`;
    }

    function compile(source) {
        const ast = new Parser(tokenize(String(source))).parse();
        const warnings = [];
        const instructions = resolveInstructions(compileStatements(ast.body, warnings));
        if (instructions.length === 0) {
            throw new MktnCompileError("実行可能な命令がありません");
        }
        return {
            ast,
            instructions,
            assembly: instructions.map(mnemonic).join("\n"),
            binary: formatBinary(instructions, true),
            rawBinary: formatBinary(instructions, false),
            warnings
        };
    }

    return {
        OP, MktnCompileError, tokenize, compile, formatBinary, instructionToBinary
    };
});
