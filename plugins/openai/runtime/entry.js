#!/usr/bin/env node
import { createRequire } from "node:module"; import { fileURLToPath as runtimeFileURLToPath } from "node:url"; import { dirname as runtimeDirname } from "node:path"; const require = createRequire(import.meta.url); const __filename = runtimeFileURLToPath(import.meta.url); const __dirname = runtimeDirname(__filename);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports._CodeOrName = _CodeOrName;
    exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports._Code = _Code;
    exports.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports._ = _;
    var plus = new _Code("+");
    function str(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports.str = str;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
    }
    exports.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
    exports.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants3) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants3);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants3) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants3);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants3) {
        this.code = optimizeExpr(this.code, names, constants3);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants3) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants3))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants3) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants3);
        if (!(super.optimizeNames(names, constants3) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants3);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants3) {
        if (!super.optimizeNames(names, constants3))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants3);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants3) {
        if (!super.optimizeNames(names, constants3))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants3);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants3) {
        var _a, _b;
        super.optimizeNames(names, constants3);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants3);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants3);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants3) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants3[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants3[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports.not = not;
    var andCode = mappend(exports.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports.and = and;
    var orCode = mappend(exports.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports.toHash = toHash;
    function alwaysValidSchema(it, schema) {
      if (typeof schema == "boolean")
        return schema;
      if (Object.keys(schema).length === 0)
        return true;
      checkUnknownRules(it, schema);
      return !schemaHasRules(schema, it.self.RULES.all);
    }
    exports.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema, rules) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (rules[key])
          return true;
      return false;
    }
    exports.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema, RULES) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
      if (!$data) {
        if (typeof schema == "number" || typeof schema == "boolean")
          return schema;
        if (typeof schema == "string")
          return (0, codegen_1._)`${schema}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str) {
      return unescapeJsonPointer(decodeURIComponent(str));
    }
    exports.unescapeFragment = unescapeFragment;
    function escapeFragment(str) {
      return encodeURIComponent(escapeJsonPointer(str));
    }
    exports.escapeFragment = escapeFragment;
    function escapeJsonPointer(str) {
      if (typeof str == "number")
        return `${str}`;
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str) {
      return str.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports.reportError = reportError;
    function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema, validateName } = it;
      if (schema === false) {
        falseSchemaError(it, false);
      } else if (typeof schema == "object" && schema.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema } = it;
      if (schema === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getRules = exports.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema, self }, type) {
      const group = self.RULES.types[type];
      return group && group !== true && shouldUseGroup(schema, group);
    }
    exports.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema, group) {
      return group.rules.some((rule2) => shouldUseRule(schema, rule2));
    }
    exports.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema, rule2) {
      var _a;
      return schema[rule2.keyword] !== void 0 || ((_a = rule2.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== void 0));
    }
    exports.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports.DataType = DataType = {}));
    function getSchemaTypes(schema) {
      const types = getJSONTypes(schema.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema }) => `must be ${schema}`,
      params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema, keyword, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
    }
    exports.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports, module) {
    "use strict";
    module.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports, module) {
    "use strict";
    var traverse = module.exports = function(schema, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema, "", schema);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema && typeof schema == "object" && !Array.isArray(schema)) {
        pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema) {
          var sch = schema[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
          }
        }
        post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema, limit = true) {
      if (typeof schema == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema);
      if (!limit)
        return false;
      return countKeys(schema) <= limit;
    }
    exports.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema) {
      for (const key in schema) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema) {
      let count = 0;
      for (const key in schema) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema[key] == "object") {
          (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema, baseId) {
      if (typeof schema == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getData = exports.KeywordCxt = exports.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema, opts) {
      const schId = typeof schema == "object" && schema[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema, self }) {
      if (typeof schema == "boolean")
        return !schema;
      for (const key in schema)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema, gen, opts } = it;
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema, errSchemaPath, opts, self } = it;
      if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema, opts } = it;
      if (schema.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
      const msg = schema.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule2 of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema, rule2)) {
            keywordCode(it, rule2.keyword, rule2.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule2 = rules[keyword];
        if (typeof rule2 == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule2)) {
          const { type } = rule2.definition;
          if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema;
        if (typeof env.schema == "object")
          schema = env.schema;
        this.schema = env.schema;
        this.schemaId = env.schemaId;
        this.root = env.root || this;
        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
        this.schemaPath = env.schemaPath;
        this.localRefs = env.localRefs;
        this.meta = env.meta;
        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
        this.refs = {};
      }
    };
    exports.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve.call(this, root, ref);
      if (_sch === void 0) {
        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema)
          _sch = new SchemaEnv({ schema, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema === "boolean")
          return;
        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema = partSchema;
        const schId = typeof schema === "object" && schema[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env;
      if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
        env = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env = env || new SchemaEnv({ schema, schemaId, root, baseId });
      if (env.schema !== env.root.schema)
        return env;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports, module) {
    module.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports, module) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
    var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
    var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
    var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
    var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
    var BYTE_HEX = new Array(256);
    {
      const HEX_DIGITS = "0123456789ABCDEF";
      for (let i = 0; i < 256; i++) {
        BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
      }
    }
    function percentEncodeNonAscii(cp) {
      if (cp < 2048) {
        return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
      }
      if (cp < 65536) {
        return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
      }
      return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
    }
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
    var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
    var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function isZoneIdentifier(zone) {
      if (zone.length === 0) return false;
      for (let i = 0; i < zone.length; i++) {
        if (isZoneCharacter(zone[i])) continue;
        if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
          i += 2;
          continue;
        }
        return false;
      }
      return true;
    }
    function compressIPv6ZeroRun(hextets) {
      let bestStart = -1;
      let bestLength = 0;
      let runStart = -1;
      let runLength = 0;
      for (let i = 0; i < hextets.length; i++) {
        if (hextets[i] === "0") {
          if (runStart === -1) runStart = i;
          runLength++;
          if (runLength > bestLength) {
            bestLength = runLength;
            bestStart = runStart;
          }
        } else {
          runStart = -1;
          runLength = 0;
        }
      }
      if (bestLength < 2) return hextets.join(":");
      const head = hextets.slice(0, bestStart).join(":");
      const tail = hextets.slice(bestStart + bestLength).join(":");
      return head + "::" + tail;
    }
    function normalizeIPv6Address(input) {
      const compression = input.indexOf("::");
      if (compression !== -1 && input.indexOf("::", compression + 1) !== -1) return void 0;
      const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
      const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
      if (compression !== -1) {
        if (left.length === 1 && left[0] === "") left.length = 0;
        if (right.length === 1 && right[0] === "") right.length = 0;
      }
      const parts = left.concat(right);
      let hextetCount = 0;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === "") return void 0;
        if (part.indexOf(".") !== -1) {
          if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part)) return void 0;
          hextetCount += 2;
          continue;
        }
        if (!isHextet(part)) return void 0;
        parts[i] = parseInt(part, 16).toString(16);
        hextetCount++;
      }
      if (compression === -1) {
        if (hextetCount !== 8) return void 0;
        return compressIPv6ZeroRun(parts);
      }
      if (hextetCount >= 8) return void 0;
      const expanded = parts.slice(0, left.length);
      for (let i = hextetCount; i < 8; i++) expanded.push("0");
      for (let i = left.length; i < parts.length; i++) expanded.push(parts[i]);
      return compressIPv6ZeroRun(expanded);
    }
    function normalizeIPv6(host) {
      const bracketed = host[0] === "[" && host[host.length - 1] === "]";
      const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
      if (hasBracket && !bracketed) return { host, isIPV6: false, error: true };
      let input = bracketed ? host.slice(1, -1) : host;
      if (bracketed && isIPvFuture(input)) {
        input = input.toLowerCase();
        return { host: `[${input}]`, escapedHost: input, isIPV6: false, isIPVFuture: true };
      }
      if (findToken(input, ":") < 2) {
        return { host, isIPV6: false, error: bracketed };
      }
      let zoneIdentifier = "";
      const zoneSeparator = input.indexOf("%");
      if (zoneSeparator !== -1) {
        const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
        zoneIdentifier = input.slice(zoneSeparator + separatorLength);
        if (!isZoneIdentifier(zoneIdentifier)) return { host, isIPV6: false, error: true };
        input = input.slice(0, zoneSeparator);
      }
      const address = normalizeIPv6Address(input);
      if (address === void 0) return { host, isIPV6: false, error: true };
      return {
        host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
        escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
        isIPV6: true
      };
    }
    function findToken(str, token) {
      let ind = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path10) {
      let input = path10;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
    var HOST_DELIM_RE = /[@/?#:]/g;
    var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
    function reescapeHostDelimiters(host, isIP) {
      const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
      re.lastIndex = 0;
      return host.replace(re, (ch) => HOST_DELIMS[ch]);
    }
    function normalizePercentEncoding(input, decodeUnreserved = false) {
      if (input.indexOf("%") === -1) {
        return input;
      }
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decodeUnreserved && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        output += input[i];
      }
      return output;
    }
    function normalizePathEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (decoded !== "." && isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isPathCharacter(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function serializePathEncoding(input, pathNoScheme = false) {
      let output = "";
      let firstSegment = pathNoScheme && input[0] !== "/";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (ch === "/") {
          firstSegment = false;
        }
        if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeComponent(input, isAllowed) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        if (isAllowed(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function encodeUserinfo(input) {
      return encodeComponent(input, isUserinfoCharacter);
    }
    function encodeQuery(input) {
      return encodeComponent(input, isQueryFragmentCharacter);
    }
    function encodeFragment(input) {
      return encodeComponent(input, isQueryFragmentCharacter);
    }
    function isEscapeSafe(cp) {
      return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
    }
    function normalizeQueryFragmentEncoding(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            const normalizedHex = hex.toUpperCase();
            const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
            if (isUnreserved(decoded)) {
              output += decoded;
            } else {
              output += "%" + normalizedHex;
            }
            i += 2;
            continue;
          }
        }
        if (isQueryFragmentCharacter(ch)) {
          output += ch;
        } else {
          const code = input.charCodeAt(i);
          if (code < 128) {
            output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
          } else if (code < 55296 || code > 57343) {
            output += percentEncodeNonAscii(code);
          } else if (code <= 56319 && i + 1 < input.length) {
            const low = input.charCodeAt(i + 1);
            if (low >= 56320 && low <= 57343) {
              output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
              i++;
            } else {
              output += percentEncodeNonAscii(65533);
            }
          } else {
            output += percentEncodeNonAscii(65533);
          }
        }
      }
      return output;
    }
    function escapePreservingEscapes(input) {
      let output = "";
      for (let i = 0; i < input.length; i++) {
        if (input[i] === "%" && i + 2 < input.length) {
          const hex = input.slice(i + 1, i + 3);
          if (isHexPair(hex)) {
            output += "%" + hex.toUpperCase();
            i += 2;
            continue;
          }
        }
        output += escape(input[i]);
      }
      return output;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(encodeUserinfo(component.userinfo));
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = component.host;
        if (!isIPv4(host)) {
          let ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
            host = normalizePercentEncoding(host, true);
            ipV6res = normalizeIPv6(host);
          }
          if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = reescapeHostDelimiters(host, false);
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      reescapeHostDelimiters,
      normalizePercentEncoding,
      normalizePathEncoding,
      serializePathEncoding,
      normalizeQueryFragmentEncoding,
      encodeUserinfo,
      encodeQuery,
      encodeFragment,
      escapePreservingEscapes,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports, module) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const queryIndex = wsComponent.resourceName.indexOf("?");
        const path10 = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
        wsComponent.path = path10 && path10 !== "/" ? path10 : void 0;
        wsComponent.query = queryIndex === -1 ? void 0 : wsComponent.resourceName.slice(queryIndex + 1);
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches && matches[0] === urnComponent.path) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports, module) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
    var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
    function decodeValidScheme(scheme) {
      const decodedScheme = unescape(String(scheme));
      if (!VALID_SCHEME.test(decodedScheme)) {
        throw new TypeError(MALFORMED_SCHEME_ERROR);
      }
      return decodedScheme;
    }
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        normalizeString(uri, options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse(serialize(uri, options), options);
      }
      return uri;
    }
    function resolve(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const {
        parsed: baseParsed,
        malformedAuthorityOrPort: baseMalformed,
        malformedPercentEncoding: baseMalformedPercentEncoding,
        malformedSchemeSpecific: baseMalformedSchemeSpecific,
        malformedHost: baseMalformedHost,
        malformedScheme: baseMalformedScheme
      } = parseWithStatus(baseURI, schemelessOptions);
      const {
        parsed: relativeParsed,
        malformedAuthorityOrPort: relativeMalformed,
        malformedPercentEncoding: relativeMalformedPercentEncoding,
        malformedSchemeSpecific: relativeMalformedSchemeSpecific,
        malformedHost: relativeMalformedHost,
        malformedScheme: relativeMalformedScheme
      } = parseWithStatus(relativeURI, schemelessOptions);
      if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
        throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
      }
      const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
      const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
      const resolvedHost = resolved.host;
      const resolvedHostIsIP = resolvedHost !== void 0 && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
      canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
      const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !new RegExp("\\P{ASCII}", "u").test(resolvedHost);
      if (resolved.error && !encodedASCIIHost) {
        throw new Error(resolved.error);
      }
      schemelessOptions.skipEscape = true;
      return serialize(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse(serialize(base, options), options);
        relative = parse(serialize(relative, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative.scheme) {
        target.scheme = relative.scheme;
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (relative.userinfo !== void 0 || relative.host !== void 0 || relative.port !== void 0) {
          target.userinfo = relative.userinfo;
          target.host = relative.host;
          target.port = relative.port;
          target.path = removeDotSegments(relative.path || "");
          target.query = relative.query;
        } else {
          if (!relative.path) {
            target.path = base.path;
            if (relative.query !== void 0) {
              target.query = relative.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative.path[0] === "/") {
              target.path = removeDotSegments(relative.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative.path;
              } else if (!base.path) {
                target.path = relative.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      const normalizedA = normalizeComparableURI(uriA, options);
      const normalizedB = normalizeComparableURI(uriB, options);
      return normalizedA !== void 0 && normalizedB !== void 0 && normalizedA === normalizedB;
    }
    function serialize(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      if (component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
      }
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      const hasAuthority = component.userinfo !== void 0 || component.host !== void 0 || component.port !== void 0;
      const pathNoScheme = !options.skipEscape && component.scheme === void 0 && !hasAuthority;
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = serializePathEncoding(component.path, pathNoScheme);
        } else {
          component.path = normalizePercentEncoding(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        component.scheme = decodeValidScheme(component.scheme);
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (pathNoScheme) {
          s = serializePathEncoding(s, true);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", encodeQuery(component.query));
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", encodeFragment(component.fragment));
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
    var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
    function getParseError(parsed, matches) {
      if (matches[2] !== void 0 && parsed.path && parsed.path[0] !== "/") {
        return 'URI path must start with "/" when authority is present.';
      }
      if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
        return "URI port is malformed.";
      }
      return void 0;
    }
    function hasMalformedPercentEncoding(component) {
      if (component === void 0) return false;
      let percent = component.indexOf("%");
      while (percent !== -1) {
        if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
          return true;
        }
        percent = component.indexOf("%", percent + 3);
      }
      return false;
    }
    function hasMalformedComponentPercentEncoding(matches) {
      const host = matches[4];
      return hasMalformedPercentEncoding(matches[3]) || host !== void 0 && !(host[0] === "[" && host[host.length - 1] === "]") && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
    }
    function canonicalizeHost(parsed, options, schemeHandler, isIP) {
      if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && parsed.host[0] !== "[" && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
        try {
          parsed.host = new URL("http://" + parsed.host).hostname;
        } catch (e) {
          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
          return true;
        }
      }
      return false;
    }
    function parseWithStatus(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let malformedAuthorityOrPort = false;
      let malformedPercentEncoding = false;
      let malformedSchemeSpecific = false;
      let malformedHost = false;
      let malformedIPLiteral = false;
      let malformedScheme = false;
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const authorityMatch = uri.match(AUTHORITY_PREFIX);
      if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
        parsed.error = "URI authority must not contain a literal backslash.";
        malformedAuthorityOrPort = true;
      }
      const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
      if (introducerMatch !== null) {
        const region = introducerMatch[1];
        const normalizedRegion = region.replace(/[\t\n\r]/g, "");
        if (normalizedRegion.length >= 2) {
          if (normalizedRegion.slice(0, 2) !== "//") {
            parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
            malformedAuthorityOrPort = true;
          } else if (region.length !== normalizedRegion.length) {
            parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
            malformedAuthorityOrPort = true;
          }
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (parsed.scheme !== void 0) {
          const decodedScheme = unescape(parsed.scheme);
          if (VALID_SCHEME.test(decodedScheme)) {
            parsed.scheme = decodedScheme.toLowerCase();
          } else {
            parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
            malformedScheme = true;
          }
        }
        malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
        if (malformedPercentEncoding) {
          parsed.error = parsed.error || "URI contains malformed percent-encoding.";
        }
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        const parseError = getParseError(parsed, matches);
        if (parseError !== void 0) {
          parsed.error = parsed.error || parseError;
          malformedAuthorityOrPort = true;
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const bracketedIPLiteral = parsed.host[0] === "[" && parsed.host[parsed.host.length - 1] === "]";
            const ipv6result = normalizeIPv6(parsed.host);
            isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
            malformedIPLiteral = bracketedIPLiteral && ipv6result.error === true;
            parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
            if (malformedIPLiteral) {
              parsed.error = parsed.error || "URI host is malformed.";
              malformedAuthorityOrPort = true;
            }
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.host !== void 0 && !malformedIPLiteral) {
              const host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
              parsed.host = reescapeHostDelimiters(host, isIP);
            }
          }
          if (parsed.path) {
            parsed.path = normalizePathEncoding(parsed.path);
          }
          if (parsed.query) {
            parsed.query = normalizeQueryFragmentEncoding(parsed.query);
          }
          if (parsed.fragment) {
            parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
          if (schemeHandler === SCHEMES.urn && parsed.nid === void 0) {
            malformedSchemeSpecific = true;
          }
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
    }
    function parse(uri, opts) {
      return parseWithStatus(uri, opts).parsed;
    }
    function normalizeString(uri, opts) {
      return normalizeStringWithStatus(uri, opts).normalized;
    }
    function normalizeStringWithStatus(uri, opts) {
      const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
      return {
        normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
        malformedAuthorityOrPort,
        malformedPercentEncoding,
        malformedSchemeSpecific,
        malformedHost,
        malformedScheme
      };
    }
    function normalizeComparableURI(uri, opts) {
      if (typeof uri !== "string" && typeof uri !== "object") {
        return void 0;
      }
      let value;
      try {
        value = typeof uri === "string" ? uri : serialize(uri, opts);
      } catch {
        return void 0;
      }
      const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
      return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? void 0 : normalized;
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve,
      resolveComponent,
      equal,
      serialize,
      parse
    };
    module.exports = fastUri;
    module.exports.default = fastUri;
    module.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str, flags) => new RegExp(str, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = /* @__PURE__ */ Object.create(null);
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema, _meta) {
        const sch = this._addSchema(schema, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema)) {
          for (const sch of schema)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema === "object") {
          const { schemaId } = this.opts;
          id = schema[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema, throwOrLogError) {
        if (typeof schema == "boolean")
          return true;
        let $schema;
        $schema = schema.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule2 = this.RULES.all[keyword];
        return typeof rule2 == "object" ? rule2.definition : !!rule2;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule2) => rule2.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule2 = rules[key];
            if (typeof rule2 != "object")
              continue;
            const { $data } = rule2.definition;
            const schema = keywords[key];
            if ($data && schema)
              keywords[key] = schemaOrData(schema);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema == "object") {
          id = schema[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema)
          this.validateSchema(schema, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv.ValidationError = validation_error_1.default;
    Ajv.MissingRefError = ref_error_1.default;
    exports.default = Ajv;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule2 = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule2, definition.before);
      else
        ruleGroup.rules.push(rule2);
      RULES.all[keyword] = rule2;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule2, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule2);
      } else {
        ruleGroup.rules.push(rule2);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema) {
      return { anyOf: [schema, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.callRef = exports.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env, validateName, opts, self } = it;
        const { root } = env;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env === root)
            return callRef(cxt, validateName, env, env.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports.callRef = callRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports.default = core;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema.length === 0)
          return;
        const useLoop = schema.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema } = cxt;
        if ($data || schema && typeof schema == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        if (!$data && schema.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports.validateAdditionalItems = validateAdditionalItems;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema, it } = cxt;
        if (Array.isArray(schema))
          return validateTuple(cxt, "additionalItems", schema);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports.validateTuple = validateTuple;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports.validateSchemaDeps = validateSchemaDeps;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
            deleteAdditional(key);
            return;
          }
          if (schema === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, parentSchema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema, it } = cxt;
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema = it.schema[keyword];
      return schema !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicAnchor = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicAnchor",
      schemaType: "string",
      code: (cxt) => dynamicAnchor(cxt, cxt.schema)
    };
    function dynamicAnchor(cxt, anchor) {
      const { gen, it } = cxt;
      it.schemaEnv.root.dynamicAnchors[anchor] = true;
      const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
      const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
      gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
    }
    exports.dynamicAnchor = dynamicAnchor;
    function _getValidate(cxt) {
      const { schemaEnv, schema, self } = cxt.it;
      const { root, baseId, localRefs, meta } = schemaEnv.root;
      const { schemaId } = self.opts;
      const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
      compile_1.compileSchema.call(self, sch);
      return (0, ref_1.getValidate)(cxt, sch);
    }
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.dynamicRef = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var ref_1 = require_ref();
    var def = {
      keyword: "$dynamicRef",
      schemaType: "string",
      code: (cxt) => dynamicRef(cxt, cxt.schema)
    };
    function dynamicRef(cxt, ref) {
      const { gen, keyword, it } = cxt;
      if (ref[0] !== "#")
        throw new Error(`"${keyword}" only supports hash fragment reference`);
      const anchor = ref.slice(1);
      if (it.allErrors) {
        _dynamicRef();
      } else {
        const valid = gen.let("valid", false);
        _dynamicRef(valid);
        cxt.ok(valid);
      }
      function _dynamicRef(valid) {
        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
          const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
          gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
        } else {
          _callRef(it.validateName, valid)();
        }
      }
      function _callRef(validate, valid) {
        return valid ? () => gen.block(() => {
          (0, ref_1.callRef)(cxt, validate);
          gen.let(valid, true);
        }) : () => (0, ref_1.callRef)(cxt, validate);
      }
    }
    exports.dynamicRef = dynamicRef;
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var util_1 = require_util();
    var def = {
      keyword: "$recursiveAnchor",
      schemaType: "boolean",
      code(cxt) {
        if (cxt.schema)
          (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
        else
          (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicRef_1 = require_dynamicRef();
    var def = {
      keyword: "$recursiveRef",
      schemaType: "string",
      code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS({
  "node_modules/ajv/dist/vocabularies/dynamic/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dynamicAnchor_1 = require_dynamicAnchor();
    var dynamicRef_1 = require_dynamicRef();
    var recursiveAnchor_1 = require_recursiveAnchor();
    var recursiveRef_1 = require_recursiveRef();
    var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
    exports.default = dynamic;
  }
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/dependentRequired.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentRequired",
      type: "object",
      schemaType: "object",
      error: dependencies_1.error,
      code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependencies_1 = require_dependencies();
    var def = {
      keyword: "dependentSchemas",
      type: "object",
      schemaType: "object",
      code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitContains.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["maxContains", "minContains"],
      type: "array",
      schemaType: "number",
      code({ keyword, parentSchema, it }) {
        if (parentSchema.contains === void 0) {
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS({
  "node_modules/ajv/dist/vocabularies/next.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var dependentRequired_1 = require_dependentRequired();
    var dependentSchemas_1 = require_dependentSchemas();
    var limitContains_1 = require_limitContains();
    var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
    exports.default = next;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var error = {
      message: "must NOT have unevaluated properties",
      params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
    };
    var def = {
      keyword: "unevaluatedProperties",
      type: "object",
      schemaType: ["boolean", "object"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, props } = it;
        if (props instanceof codegen_1.Name) {
          gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
        } else if (props !== true) {
          gen.forIn("key", data, (key) => props === void 0 ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
        }
        it.props = true;
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function unevaluatedPropCode(key) {
          if (schema === false) {
            cxt.setParams({ unevaluatedProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (!(0, util_1.alwaysValidSchema)(it, schema)) {
            const valid = gen.name("valid");
            cxt.subschema({
              keyword: "unevaluatedProperties",
              dataProp: key,
              dataPropType: util_1.Type.Str
            }, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
        function unevaluatedDynamic(evaluatedProps, key) {
          return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
        }
        function unevaluatedStatic(evaluatedProps, key) {
          const ps = [];
          for (const p in evaluatedProps) {
            if (evaluatedProps[p] === true)
              ps.push((0, codegen_1._)`${key} !== ${p}`);
          }
          return (0, codegen_1.and)(...ps);
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "unevaluatedItems",
      type: "array",
      schemaType: ["boolean", "object"],
      error,
      code(cxt) {
        const { gen, schema, data, it } = cxt;
        const items = it.items || 0;
        if (items === true)
          return;
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        if (schema === false) {
          cxt.setParams({ len: items });
          cxt.fail((0, codegen_1._)`${len} > ${items}`);
        } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
          gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
          cxt.ok(valid);
        }
        it.items = true;
        function validateItems(valid, from) {
          gen.forRange("i", from, len, (i) => {
            cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
            if (!it.allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          });
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS({
  "node_modules/ajv/dist/vocabularies/unevaluated/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var unevaluatedProperties_1 = require_unevaluatedProperties();
    var unevaluatedItems_1 = require_unevaluatedItems();
    var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
    exports.default = unevaluated;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.contentVocabulary = exports.metadataVocabulary = void 0;
    exports.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft2020.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var dynamic_1 = require_dynamic();
    var next_1 = require_next();
    var unevaluated_1 = require_unevaluated();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft2020Vocabularies = [
      dynamic_1.default,
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(true),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary,
      next_1.default,
      unevaluated_1.default
    ];
    exports.default = draft2020Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/schema.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/schema",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true,
        "https://json-schema.org/draft/2020-12/vocab/applicator": true,
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
        "https://json-schema.org/draft/2020-12/vocab/validation": true,
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Core and Validation specifications meta-schema",
      allOf: [
        { $ref: "meta/core" },
        { $ref: "meta/applicator" },
        { $ref: "meta/unevaluated" },
        { $ref: "meta/validation" },
        { $ref: "meta/meta-data" },
        { $ref: "meta/format-annotation" },
        { $ref: "meta/content" }
      ],
      type: ["object", "boolean"],
      $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
      properties: {
        definitions: {
          $comment: '"definitions" has been replaced by "$defs".',
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          deprecated: true,
          default: {}
        },
        dependencies: {
          $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
          type: "object",
          additionalProperties: {
            anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
          },
          deprecated: true,
          default: {}
        },
        $recursiveAnchor: {
          $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
          $ref: "meta/core#/$defs/anchorString",
          deprecated: true
        },
        $recursiveRef: {
          $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
          $ref: "meta/core#/$defs/uriReferenceString",
          deprecated: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/applicator",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/applicator": true
      },
      $dynamicAnchor: "meta",
      title: "Applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        prefixItems: { $ref: "#/$defs/schemaArray" },
        items: { $dynamicRef: "#meta" },
        contains: { $dynamicRef: "#meta" },
        additionalProperties: { $dynamicRef: "#meta" },
        properties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependentSchemas: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" },
          default: {}
        },
        propertyNames: { $dynamicRef: "#meta" },
        if: { $dynamicRef: "#meta" },
        then: { $dynamicRef: "#meta" },
        else: { $dynamicRef: "#meta" },
        allOf: { $ref: "#/$defs/schemaArray" },
        anyOf: { $ref: "#/$defs/schemaArray" },
        oneOf: { $ref: "#/$defs/schemaArray" },
        not: { $dynamicRef: "#meta" }
      },
      $defs: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $dynamicRef: "#meta" }
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
      },
      $dynamicAnchor: "meta",
      title: "Unevaluated applicator vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        unevaluatedItems: { $dynamicRef: "#meta" },
        unevaluatedProperties: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/content",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/content": true
      },
      $dynamicAnchor: "meta",
      title: "Content vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        contentEncoding: { type: "string" },
        contentMediaType: { type: "string" },
        contentSchema: { $dynamicRef: "#meta" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/core",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/core": true
      },
      $dynamicAnchor: "meta",
      title: "Core vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        $id: {
          $ref: "#/$defs/uriReferenceString",
          $comment: "Non-empty fragments not allowed.",
          pattern: "^[^#]*#?$"
        },
        $schema: { $ref: "#/$defs/uriString" },
        $ref: { $ref: "#/$defs/uriReferenceString" },
        $anchor: { $ref: "#/$defs/anchorString" },
        $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
        $dynamicAnchor: { $ref: "#/$defs/anchorString" },
        $vocabulary: {
          type: "object",
          propertyNames: { $ref: "#/$defs/uriString" },
          additionalProperties: {
            type: "boolean"
          }
        },
        $comment: {
          type: "string"
        },
        $defs: {
          type: "object",
          additionalProperties: { $dynamicRef: "#meta" }
        }
      },
      $defs: {
        anchorString: {
          type: "string",
          pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
        },
        uriString: {
          type: "string",
          format: "uri"
        },
        uriReferenceString: {
          type: "string",
          format: "uri-reference"
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
      },
      $dynamicAnchor: "meta",
      title: "Format vocabulary meta-schema for annotation results",
      type: ["object", "boolean"],
      properties: {
        format: { type: "string" }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/meta-data": true
      },
      $dynamicAnchor: "meta",
      title: "Meta-data vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        deprecated: {
          type: "boolean",
          default: false
        },
        readOnly: {
          type: "boolean",
          default: false
        },
        writeOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json"(exports, module) {
    module.exports = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://json-schema.org/draft/2020-12/meta/validation",
      $vocabulary: {
        "https://json-schema.org/draft/2020-12/vocab/validation": true
      },
      $dynamicAnchor: "meta",
      title: "Validation vocabulary meta-schema",
      type: ["object", "boolean"],
      properties: {
        type: {
          anyOf: [
            { $ref: "#/$defs/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/$defs/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        const: true,
        enum: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/$defs/nonNegativeInteger" },
        minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        maxItems: { $ref: "#/$defs/nonNegativeInteger" },
        minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        maxContains: { $ref: "#/$defs/nonNegativeInteger" },
        minContains: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 1
        },
        maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
        minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
        required: { $ref: "#/$defs/stringArray" },
        dependentRequired: {
          type: "object",
          additionalProperties: {
            $ref: "#/$defs/stringArray"
          }
        }
      },
      $defs: {
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          $ref: "#/$defs/nonNegativeInteger",
          default: 0
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      }
    };
  }
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-2020-12/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var metaSchema = require_schema();
    var applicator = require_applicator2();
    var unevaluated = require_unevaluated2();
    var content = require_content();
    var core = require_core3();
    var format = require_format_annotation();
    var metadata = require_meta_data();
    var validation = require_validation2();
    var META_SUPPORT_DATA = ["/properties"];
    function addMetaSchema2020($data) {
      ;
      [
        metaSchema,
        applicator,
        unevaluated,
        content,
        core,
        with$data(this, format),
        metadata,
        with$data(this, validation)
      ].forEach((sch) => this.addMetaSchema(sch, void 0, false));
      return this;
      function with$data(ajv, sch) {
        return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
      }
    }
    exports.default = addMetaSchema2020;
  }
});

// node_modules/ajv/dist/2020.js
var require__ = __commonJS({
  "node_modules/ajv/dist/2020.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
    var core_1 = require_core();
    var draft2020_1 = require_draft2020();
    var discriminator_1 = require_discriminator();
    var json_schema_2020_12_1 = require_json_schema_2020_12();
    var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
    var Ajv20202 = class extends core_1.default {
      constructor(opts = {}) {
        super({
          ...opts,
          dynamicRef: true,
          next: true,
          unevaluated: true
        });
      }
      _addVocabularies() {
        super._addVocabularies();
        draft2020_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        const { $data, meta } = this.opts;
        if (!meta)
          return;
        json_schema_2020_12_1.default.call(this, $data);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports.Ajv2020 = Ajv20202;
    module.exports = exports = Ajv20202;
    module.exports.Ajv2020 = Ajv20202;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Ajv20202;
    var validate_1 = require_validate();
    Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// src/hooks/entry.ts
import { access } from "node:fs/promises";
import { Buffer as Buffer2 } from "node:buffer";
import { randomUUID as randomUUID2 } from "node:crypto";
import path9 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/security/state.ts
import { createHash, randomUUID } from "node:crypto";
import { constants, realpathSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
var DIRECTORY_MODE = 448;
var FILE_MODE = 384;
function isMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function canonicalExistingPath(target) {
  let current = path.resolve(target);
  const remainder = [];
  while (true) {
    try {
      return path.join(realpathSync(current), ...remainder.reverse());
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw error;
      }
      remainder.push(path.basename(current));
      current = parent;
    }
  }
}
function repositoryStateDirectory(repoRoot) {
  const repository = canonicalExistingPath(repoRoot);
  const configured = process.env.DETESTIFY_STATE_DIR;
  const xdg = process.env.XDG_STATE_HOME;
  let base;
  if (configured !== void 0) {
    if (!path.isAbsolute(configured)) {
      throw new Error("DETESTIFY_STATE_DIR must be an absolute path.");
    }
    base = path.resolve(configured);
  } else if (xdg !== void 0 && xdg !== "") {
    if (!path.isAbsolute(xdg)) {
      throw new Error("XDG_STATE_HOME must be an absolute path.");
    }
    base = path.join(path.resolve(xdg), "detestify");
  } else {
    base = path.join(homedir(), ".local", "state", "detestify");
  }
  if (isWithin(repository, canonicalExistingPath(base))) {
    throw new Error(
      "Detestify state directory must be outside the repository."
    );
  }
  const slug = path.basename(repository).replace(/[^a-z0-9._-]/gi, "-") || "repository";
  const digest = createHash("sha256").update(repository).digest("hex").slice(0, 16);
  return path.join(base, `${slug}-${digest}`);
}
async function securePath(target) {
  const absolute = path.resolve(target);
  const bases = [homedir(), tmpdir()].map((base) => path.resolve(base)).filter((base, index, all) => all.indexOf(base) === index).sort((left, right) => right.length - left.length);
  for (const base of bases) {
    if (isWithin(base, absolute)) {
      const anchor = await realpath(base);
      return {
        anchor,
        target: path.resolve(anchor, path.relative(base, absolute))
      };
    }
  }
  return { anchor: path.parse(absolute).root, target: absolute };
}
async function assertDirectoryChain(anchor, directory) {
  const relative = path.relative(anchor, directory);
  if (!isWithin(anchor, directory)) {
    throw new Error(`Path escapes its trusted directory: ${directory}`);
  }
  let current = anchor;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to use symlink parent: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new Error(`Path parent is not a directory: ${current}`);
      }
    } catch (error) {
      if (isMissing(error)) {
        return;
      }
      throw error;
    }
  }
}
async function assertPrivateDirectory(directory) {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(
      `Trusted state path is not a regular directory: ${directory}`
    );
  }
  if ((stat.mode & 63) !== 0) {
    throw new Error(`Trusted state directory is not private: ${directory}`);
  }
  if (process.getuid !== void 0 && stat.uid !== process.getuid()) {
    throw new Error(
      `Trusted state directory is not owned by this user: ${directory}`
    );
  }
}
async function assertPrivateDirectoryRange(root, directory) {
  await assertPrivateDirectory(root);
  let current = root;
  const relative = path.relative(root, directory);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    await assertPrivateDirectory(current);
  }
}
async function prepareDirectory(directory, trustedRoot) {
  const resolved = await securePath(directory);
  await assertDirectoryChain(resolved.anchor, resolved.target);
  await mkdir(resolved.target, { recursive: true, mode: DIRECTORY_MODE });
  await assertDirectoryChain(resolved.anchor, resolved.target);
  if (trustedRoot === void 0) {
    return { directory: resolved.target, root: null };
  }
  const trusted = await securePath(trustedRoot);
  if (!isWithin(trusted.target, resolved.target)) {
    throw new Error(`Path escapes trusted state directory: ${directory}`);
  }
  await assertPrivateDirectoryRange(trusted.target, resolved.target);
  return { directory: resolved.target, root: trusted.target };
}
async function assertSafeTarget(target) {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to write through a symlink: ${target}`);
    }
    if (!stat.isFile()) {
      throw new Error(`JSON target is not a regular file: ${target}`);
    }
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}
async function writePrivateJsonAtomic(target, value, trustedRoot) {
  const resolved = await securePath(target);
  const document = JSON.stringify(value, null, 2);
  if (document === void 0) {
    throw new Error("JSON value is not serializable.");
  }
  const prepared = await prepareDirectory(
    path.dirname(resolved.target),
    trustedRoot
  );
  const destination = path.join(
    prepared.directory,
    path.basename(resolved.target)
  );
  const temporary = path.join(
    prepared.directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`
  );
  await assertSafeTarget(destination);
  try {
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      FILE_MODE
    );
    try {
      await handle.writeFile(`${document}
`, "utf8");
      await handle.chmod(FILE_MODE);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await assertDirectoryChain(resolved.anchor, prepared.directory);
    if (prepared.root !== null) {
      await assertPrivateDirectory(prepared.root);
    }
    await assertSafeTarget(destination);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => void 0);
    throw error;
  }
}
function assertPrivateFile(stat, file, maxBytes) {
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`State file is not a regular file: ${file}`);
  }
  if ((stat.mode & 63) !== 0 || stat.nlink !== 1) {
    throw new Error(`State file is not private: ${file}`);
  }
  if (process.getuid !== void 0 && stat.uid !== process.getuid()) {
    throw new Error(`State file is not owned by this user: ${file}`);
  }
  if (stat.size > maxBytes) {
    throw new Error(`State file exceeds ${maxBytes} bytes: ${file}`);
  }
}
async function readPrivateTextFile(target, trustedRoot, maxBytes) {
  const resolved = await securePath(target);
  const trusted = await securePath(trustedRoot);
  if (!isWithin(trusted.target, resolved.target)) {
    throw new Error(`Path escapes trusted state directory: ${target}`);
  }
  let before;
  try {
    before = await lstat(resolved.target);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
  await assertDirectoryChain(trusted.target, path.dirname(resolved.target));
  await assertPrivateDirectoryRange(
    trusted.target,
    path.dirname(resolved.target)
  );
  assertPrivateFile(before, resolved.target, maxBytes);
  const handle = await open(
    resolved.target,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const after = await handle.stat();
    assertPrivateFile(after, resolved.target, maxBytes);
    if (before.dev !== after.dev || before.ino !== after.ino) {
      throw new Error(`State file changed while opening: ${target}`);
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}
async function readPrivateDirectory(directory, trustedRoot) {
  const resolved = await securePath(directory);
  const trusted = await securePath(trustedRoot);
  if (!isWithin(trusted.target, resolved.target)) {
    throw new Error(`Path escapes trusted state directory: ${directory}`);
  }
  try {
    await assertDirectoryChain(trusted.target, resolved.target);
    await assertPrivateDirectoryRange(trusted.target, resolved.target);
    return await readdir(resolved.target);
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}
async function withPrivateFileLock(lockFile, trustedRoot, action) {
  const resolved = await securePath(lockFile);
  const prepared = await prepareDirectory(
    path.dirname(resolved.target),
    trustedRoot
  );
  const file = path.join(prepared.directory, path.basename(resolved.target));
  let handle = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      handle = await open(
        file,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        FILE_MODE
      );
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
    }
  }
  if (handle === null) {
    throw new Error(`Timed out acquiring state lock: ${lockFile}`);
  }
  try {
    await handle.chmod(FILE_MODE);
    return await action();
  } finally {
    await handle.close().catch(() => void 0);
    await rm(file, { force: true }).catch(() => void 0);
  }
}

// src/repository/fingerprint.ts
import { createHash as createHash2 } from "node:crypto";
import { lstat as lstat3, readlink as readlink2, realpath as realpath3 } from "node:fs/promises";
import path3 from "node:path";

// src/repository/paths.ts
import { constants as constants2 } from "node:fs";
import { lstat as lstat2, open as open2, readlink, realpath as realpath2 } from "node:fs/promises";
import path2 from "node:path";
var PathContainmentError = class extends Error {
  code = "PATH_NOT_CONTAINED";
  constructor(message) {
    super(message);
    this.name = "PathContainmentError";
  }
};
function toPosix(value) {
  return value.split(path2.sep).join("/");
}
function isGitInternal(relativePosix) {
  return relativePosix === ".git" || relativePosix.startsWith(".git/") || relativePosix.endsWith("/.git") || relativePosix.includes("/.git/");
}
function isWithin2(root, target) {
  const relative = path2.relative(root, target);
  return relative === "" || relative !== ".." && !relative.startsWith(`..${path2.sep}`) && !path2.isAbsolute(relative);
}
function isMissing2(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
async function canonicalTarget(target) {
  let current = path2.resolve(target);
  const remainder = [];
  while (true) {
    try {
      return path2.join(await realpath2(current), ...remainder.reverse());
    } catch (error) {
      if (!isMissing2(error)) throw error;
      try {
        if ((await lstat2(current)).isSymbolicLink()) {
          current = path2.resolve(
            path2.dirname(current),
            await readlink(current)
          );
          continue;
        }
      } catch (statError) {
        if (!isMissing2(statError)) throw statError;
      }
      const parent = path2.dirname(current);
      if (parent === current) throw error;
      remainder.push(path2.basename(current));
      current = parent;
    }
  }
}
async function isRepositoryMutationTargetContained(repositoryRoot, cwd, requested) {
  try {
    const lexicalRoot = path2.resolve(repositoryRoot);
    const lexicalTarget = path2.resolve(cwd, requested);
    if (!isWithin2(lexicalRoot, lexicalTarget)) return false;
    return isWithin2(
      await realpath2(lexicalRoot),
      await canonicalTarget(lexicalTarget)
    );
  } catch {
    return false;
  }
}
function normalizeRepositoryPath(requested) {
  if (requested === "" || path2.isAbsolute(requested)) {
    throw new PathContainmentError(
      `Path is not repository-relative: ${requested}`
    );
  }
  const normalized = path2.posix.normalize(toPosix(requested));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new PathContainmentError(
      `Path escapes the repository root: ${requested}`
    );
  }
  if (isGitInternal(normalized)) {
    throw new PathContainmentError(
      `Git internal paths are not readable: ${requested}`
    );
  }
  return normalized;
}
async function realpathContained(repositoryRoot, requested) {
  const relative = normalizeRepositoryPath(requested);
  const root = await realpath2(repositoryRoot);
  const resolved = await realpath2(path2.join(root, relative));
  const resolvedRelative = path2.relative(root, resolved);
  if (resolvedRelative === "" || resolvedRelative === ".." || resolvedRelative.startsWith(`..${path2.sep}`) || path2.isAbsolute(resolvedRelative)) {
    throw new PathContainmentError(
      `Path escapes the repository root after symlink resolution: ${requested}`
    );
  }
  if (isGitInternal(toPosix(resolvedRelative))) {
    throw new PathContainmentError(
      `Git internal paths are not readable: ${requested}`
    );
  }
  return resolved;
}
async function readContainedRegularFile(repositoryRoot, requested, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError(`Invalid repository file size limit: ${maxBytes}`);
  }
  const resolved = await realpathContained(repositoryRoot, requested);
  const file = await open2(resolved, constants2.O_RDONLY | constants2.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) {
      throw new PathContainmentError(
        `Path is not a regular file: ${requested}`
      );
    }
    if (stat.size > maxBytes) {
      throw new PathContainmentError(
        `Path exceeds the ${maxBytes}-byte read limit: ${requested}`
      );
    }
    const chunks = [];
    let total = 0;
    while (total <= maxBytes) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, maxBytes + 1 - total)
      );
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        return Buffer.concat(chunks, total);
      }
      total += bytesRead;
      if (total > maxBytes) {
        throw new PathContainmentError(
          `Path exceeds the ${maxBytes}-byte read limit: ${requested}`
        );
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    throw new PathContainmentError(
      `Path exceeds the ${maxBytes}-byte read limit: ${requested}`
    );
  } finally {
    await file.close();
  }
}

// src/repository/fingerprint.ts
var FINGERPRINT_FILE_SIZE_LIMIT = 64 * 1024 * 1024;
async function contentDigest(root, file) {
  if (file.status === "deleted") {
    return { digest: "deleted" };
  }
  let relative;
  let entry;
  try {
    relative = normalizeRepositoryPath(file.path);
    const realRoot = await realpath3(root);
    const parentRelative = path3.posix.dirname(relative);
    const parent = parentRelative === "." ? realRoot : await realpathContained(realRoot, parentRelative);
    entry = path3.join(parent, path3.posix.basename(relative));
  } catch (error) {
    if (error instanceof PathContainmentError) {
      return {
        digest: "uncontained",
        limitation: `Changed path ${file.path} was excluded from content hashing: ${error.message}`
      };
    }
    return {
      digest: "unreadable",
      limitation: `Changed path ${file.path} could not be resolved for hashing.`
    };
  }
  try {
    const stat = await lstat3(entry);
    if (stat.isSymbolicLink()) {
      const target = await readlink2(entry);
      return {
        digest: createHash2("sha256").update("symlink\0").update(String(stat.mode)).update("\0").update(target).digest("hex")
      };
    }
    if (!stat.isFile()) {
      return {
        digest: createHash2("sha256").update("non-regular\0").update(String(stat.mode)).digest("hex"),
        limitation: `Changed path ${file.path} is not a regular file or symbolic link; only its type and mode were hashed.`
      };
    }
    const content = await readContainedRegularFile(
      root,
      relative,
      FINGERPRINT_FILE_SIZE_LIMIT
    );
    return {
      digest: createHash2("sha256").update("regular\0").update(
        (stat.mode & 73) === 0 ? "non-executable\0" : "executable\0"
      ).update(content).digest("hex")
    };
  } catch {
    return {
      digest: "unreadable",
      limitation: `Changed path ${file.path} could not be read for hashing.`
    };
  }
}
async function fingerprintDiff(snapshot) {
  const limitations = [];
  const entries = [];
  const sorted = [...snapshot.changedFiles].sort(
    (left, right) => left.path.localeCompare(right.path)
  );
  for (const file of sorted) {
    const { digest, limitation } = await contentDigest(snapshot.root, file);
    if (limitation !== void 0) {
      limitations.push(limitation);
    }
    entries.push(
      [file.path, file.status, file.previousPath ?? "", digest].join("")
    );
  }
  const hash = createHash2("sha256");
  hash.update(snapshot.baseRevision ?? "no-base");
  hash.update("\0");
  hash.update(snapshot.headRevision ?? "no-head");
  for (const entry of entries) {
    hash.update("\0");
    hash.update(entry);
  }
  return {
    fingerprint: `sha256:${hash.digest("hex")}`,
    limitations
  };
}

// src/repository/git.ts
import { spawn } from "node:child_process";
import path4 from "node:path";
var GitError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "GitError";
  }
};
var DEFAULT_TIMEOUT_MS = 1e4;
var DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
function gitEnvironment() {
  const env = {
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0"
  };
  if (process.env.PATH !== void 0) {
    env.PATH = process.env.PATH;
  }
  if (process.env.HOME !== void 0) {
    env.HOME = process.env.HOME;
  }
  return env;
}
async function runGit(cwd, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const argv = ["-c", "core.fsmonitor=false", ...args];
  return new Promise((resolve, reject) => {
    const child = spawn("git", argv, {
      cwd,
      env: gitEnvironment(),
      windowsHide: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks = [];
    const stderrChunks = [];
    const finish = (error, result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error !== void 0) {
        reject(error);
      } else if (result !== void 0) {
        resolve(result);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        overflow = true;
        killProcessGroup(child.pid);
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        overflow = true;
        killProcessGroup(child.pid);
        return;
      }
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        finish(new GitError("Git executable not found.", "GIT_UNAVAILABLE"));
      } else {
        finish(
          new GitError(`git failed to start: ${error.message}`, "GIT_FAILED")
        );
      }
    });
    child.on("close", (code) => {
      if (timedOut) {
        finish(
          new GitError(
            `git ${args[0] ?? ""} exceeded ${timeoutMs} ms; its process group was killed.`,
            "GIT_TIMEOUT"
          )
        );
        return;
      }
      if (overflow) {
        finish(
          new GitError(
            `git ${args[0] ?? ""} output exceeded ${maxOutputBytes} bytes.`,
            "GIT_OUTPUT_TRUNCATED"
          )
        );
        return;
      }
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) {
        finish(void 0, { stdout, stderr });
        return;
      }
      finish(
        new GitError(
          `git ${args.join(" ")} failed: ${stderr.trim() || `exit ${code ?? "signal"}`}`,
          "GIT_FAILED"
        )
      );
    });
  });
}
function killProcessGroup(pid) {
  if (pid === void 0) {
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
}
async function resolveRepositoryRoot(start, options = {}) {
  let stdout;
  try {
    ({ stdout } = await runGit(
      start,
      ["rev-parse", "--show-toplevel"],
      options
    ));
  } catch (error) {
    if (error instanceof GitError && error.code === "GIT_FAILED") {
      throw new GitError(
        `No Git repository contains ${path4.resolve(start)}.`,
        "NOT_A_REPOSITORY"
      );
    }
    throw error;
  }
  const top = stdout.trim();
  if (top === "") {
    throw new GitError(
      `No Git repository contains ${path4.resolve(start)}.`,
      "NOT_A_REPOSITORY"
    );
  }
  return top;
}
async function gitVersion(cwd, options = {}) {
  try {
    const { stdout } = await runGit(cwd, ["--version"], options);
    const trimmed = stdout.trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}
async function revParse(root, ref, options) {
  try {
    const { stdout } = await runGit(
      root,
      ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      options
    );
    const sha = stdout.trim();
    return sha === "" ? null : sha;
  } catch {
    return null;
  }
}
async function resolveBaseRevision(root, head, requestedBase, options = {}) {
  if (requestedBase === void 0) {
    return head;
  }
  const base = await revParse(root, requestedBase, options);
  if (base === null) {
    throw new GitError(
      `Base revision not found: ${requestedBase}`,
      "GIT_FAILED"
    );
  }
  if (head === null) {
    return base;
  }
  try {
    const { stdout } = await runGit(root, ["merge-base", base, head], options);
    const mergeBase = stdout.trim();
    return mergeBase === "" ? base : mergeBase;
  } catch {
    return base;
  }
}
var STATUS_BY_LETTER = {
  A: "added",
  M: "modified",
  D: "deleted",
  T: "type-changed"
};
function parseNameStatusZ(output) {
  const fields = output.split("\0").filter((field3) => field3 !== "");
  const files = [];
  let index = 0;
  while (index < fields.length) {
    const status = fields[index];
    if (status === void 0) {
      break;
    }
    const letter = status[0] ?? "";
    if (letter === "R" || letter === "C") {
      const previousPath = fields[index + 1];
      const newPath = fields[index + 2];
      if (previousPath !== void 0 && newPath !== void 0) {
        files.push({
          path: newPath,
          previousPath,
          status: letter === "R" ? "renamed" : "copied",
          binary: false
        });
      }
      index += 3;
      continue;
    }
    const filePath = fields[index + 1];
    if (filePath !== void 0) {
      files.push({
        path: filePath,
        status: STATUS_BY_LETTER[letter] ?? "modified",
        binary: false
      });
    }
    index += 2;
  }
  return files;
}
function parseNumstatZ(output) {
  const records = output.split("\0");
  const binaryPaths = /* @__PURE__ */ new Set();
  let addedLines = 0;
  let deletedLines = 0;
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    if (record === void 0 || record === "") {
      index += 1;
      continue;
    }
    const [added, deleted, filePath] = record.split("	");
    if (added === void 0 || deleted === void 0) {
      index += 1;
      continue;
    }
    let effectivePath = filePath ?? "";
    if (effectivePath === "") {
      const newPath = records[index + 2];
      effectivePath = newPath ?? "";
      index += 3;
    } else {
      index += 1;
    }
    if (added === "-" && deleted === "-") {
      if (effectivePath !== "") {
        binaryPaths.add(effectivePath);
      }
      continue;
    }
    const addedCount = Number.parseInt(added, 10);
    const deletedCount = Number.parseInt(deleted, 10);
    if (Number.isFinite(addedCount)) {
      addedLines += addedCount;
    }
    if (Number.isFinite(deletedCount)) {
      deletedLines += deletedCount;
    }
  }
  return { binaryPaths, addedLines, deletedLines };
}
async function untrackedFiles(root, options) {
  const { stdout } = await runGit(
    root,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    options
  );
  return stdout.split("\0").filter((file) => file !== "");
}
async function snapshotRepository(start, requestedBase, options = {}) {
  const root = await resolveRepositoryRoot(start, options);
  const version = await gitVersion(root, options);
  const head = await revParse(root, "HEAD", options);
  const base = await resolveBaseRevision(root, head, requestedBase, options);
  const byPath = /* @__PURE__ */ new Map();
  let addedLines = 0;
  let deletedLines = 0;
  if (base !== null) {
    const { stdout: nameStatus } = await runGit(
      root,
      ["diff", "--name-status", "-z", "-M", base],
      options
    );
    const { stdout: numstat } = await runGit(
      root,
      ["diff", "--numstat", "-z", "-M", base],
      options
    );
    const summary = parseNumstatZ(numstat);
    addedLines = summary.addedLines;
    deletedLines = summary.deletedLines;
    for (const file of parseNameStatusZ(nameStatus)) {
      byPath.set(file.path, {
        ...file,
        binary: summary.binaryPaths.has(file.path)
      });
    }
  }
  for (const file of await untrackedFiles(root, options)) {
    if (!byPath.has(file)) {
      byPath.set(file, { path: file, status: "untracked", binary: false });
    }
  }
  const { stdout: porcelain } = await runGit(
    root,
    ["status", "--porcelain=v1", "--untracked-files=all", "-z"],
    options
  );
  const dirty = porcelain.split("\0").some((entry) => entry !== "");
  const changedFiles = [...byPath.values()].sort(
    (left, right) => left.path.localeCompare(right.path)
  );
  return {
    root,
    baseRevision: base,
    headRevision: head,
    changedFiles,
    addedLines,
    deletedLines,
    dirty,
    gitVersion: version
  };
}

// src/evidence/verdict.ts
import { createHash as createHash3 } from "node:crypto";
import { realpath as realpath4 } from "node:fs/promises";
import path6 from "node:path";

// src/core/schemas/index.ts
var import__ = __toESM(require__(), 1);
import { readFile } from "node:fs/promises";
import path5 from "node:path";
import { fileURLToPath } from "node:url";
var Ajv2020 = import__.default.default;
var SCHEMA_FILES = [
  "cleanup-plan.schema.json",
  "config.schema.json",
  "decision.schema.json",
  "evidence.schema.json",
  "hook-io.schema.json",
  "obligation-candidate.schema.json",
  "report.schema.json"
];
var schemaDirectory = fileURLToPath(
  new URL("../schemas/", import.meta.url)
);
async function loadSchemas() {
  const schemas = /* @__PURE__ */ new Map();
  await Promise.all(
    SCHEMA_FILES.map(async (name) => {
      const source = await readFile(path5.join(schemaDirectory, name), "utf8");
      schemas.set(name, JSON.parse(source));
    })
  );
  return schemas;
}
async function createSchemaValidator() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false
  });
  ajv.addFormat("date-time", (value) => {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) && !Number.isNaN(Date.parse(value));
  });
  for (const schema of (await loadSchemas()).values()) {
    ajv.addSchema(schema);
  }
  return ajv;
}
async function getValidator(schemaFile) {
  const ajv = await createSchemaValidator();
  const schema = (await loadSchemas()).get(schemaFile);
  if (schema === void 0) {
    throw new Error(`Packaged schema not found: ${schemaFile}`);
  }
  const schemaId = typeof schema === "object" && schema !== null && "$id" in schema && typeof schema.$id === "string" ? schema.$id : void 0;
  const validate = schemaId === void 0 ? void 0 : ajv.getSchema(schemaId);
  if (validate === void 0) {
    throw new Error(`Packaged schema did not register: ${schemaFile}`);
  }
  return validate;
}
function formatSchemaErrors(errors) {
  return (errors ?? []).map(
    (error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`
  ).join("; ");
}

// src/core/materiality/index.ts
function assignTier(input) {
  const { axes, distinctChangedObligation } = input;
  const { consequence, exposure, change_mechanism, evidence_gap, confidence } = axes;
  if (change_mechanism === "no_behavior") return "T0";
  if (evidence_gap === "none" && !distinctChangedObligation) return "T0";
  const known = evidence_gap !== "unknown" && confidence !== "unknown";
  if (known) {
    if (consequence === "negligible" && exposure === "internal" && change_mechanism === "pure_behavior" || evidence_gap === "partial" && consequence === "negligible") {
      return "T1";
    }
    if (consequence === "degraded" && exposure === "user_facing" || change_mechanism === "pure_behavior" && (evidence_gap === "partial" || evidence_gap === "material") || change_mechanism === "boundary" && (evidence_gap === "partial" || evidence_gap === "material") && (exposure === "internal" || exposure === "user_facing")) {
      return "T2";
    }
    if (exposure === "cross_system" && change_mechanism === "boundary" || (exposure === "cross_system" || change_mechanism === "stateful_or_irreversible") && evidence_gap === "material") {
      return "T3";
    }
    if ((consequence === "regulated_or_safety_critical" || exposure === "adversarial") && evidence_gap === "material" && (confidence === "explicit" || confidence === "observed")) {
      return "T4";
    }
  }
  return "TU";
}
function maximumGateBehavior(tier) {
  switch (tier) {
    case "T0":
      return "allow";
    case "T1":
    case "TU":
      return "advise";
    case "T2":
    case "T3":
    case "T4":
      return "request_remediation";
  }
}
function isGateEligible(input) {
  switch (input.provenance) {
    case "declared":
      return input.executableGapDemonstrated;
    case "observed":
      return true;
    case "derived":
      return input.elevatedRuleIds.includes(input.ruleId);
    case "inferred":
    case "unknown":
      return false;
  }
}
function allowedGateAction(input) {
  const ceiling = maximumGateBehavior(input.tier);
  if (ceiling === "allow") return "allow";
  if (ceiling === "advise") return "advise";
  if (input.mode === "advisory") return "advise";
  if (!input.gateEligible) return "advise";
  switch (input.tier) {
    case "T2":
    case "T4":
      return input.provenance === "declared" || input.provenance === "observed" ? "request_remediation" : "advise";
    case "T3":
      if (input.provenance === "derived" && input.mode !== "strict") {
        return "advise";
      }
      return "request_remediation";
    default:
      return "advise";
  }
}

// src/core/policy/rules.ts
var POLICY_RULES = [
  {
    id: "TST-001",
    title: "Externally observable behavior",
    statement: "Recommend persistent evidence when a distinct externally observable behavior changes and cheaper evidence does not already protect it.",
    classification: "semantic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "TST-002",
    title: "Business or safety invariant",
    statement: "Prioritize authorization, accounting, idempotency, uniqueness, ordering, state transition, and irreversible-action invariants.",
    classification: "semantic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "irreversible",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "TST-003",
    title: "Confirmed regression",
    statement: "Add one focused regression guard only when a reproduced failure class is not already reliably detected.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: { purpose: "regression" },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "TST-004",
    title: "Risky boundary",
    statement: "Place evidence at databases, queues, filesystems, networks, clocks, concurrency, serialization, providers, auth, or deployment boundaries when that is where failure occurs.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "boundary-failure"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary"
    }
  },
  {
    id: "TST-005",
    title: "Contracts and compatibility",
    statement: "Protect consumer/provider contracts, schemas, formats, migrations, and version windows.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "contract",
      purpose: "compatibility",
      technique: "example",
      cadence: "pull_request",
      failure_class: "contract-regression"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary"
    }
  },
  {
    id: "TST-006",
    title: "Critical journeys",
    statement: "Maintain a small number of system-level checks for explicitly critical user or operator journeys.",
    classification: "semantic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "system",
      purpose: "acceptance",
      technique: "example",
      cadence: "pull_request",
      failure_class: "critical-journey-wiring"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "boundary"
    }
  },
  {
    id: "TST-007",
    title: "Nonfunctional obligation",
    statement: "Use specialized evidence for security, privacy, accessibility, latency, resilience, recovery, and compliance at the observable scope.",
    classification: "non-automatable",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: {},
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "boundary"
    }
  },
  {
    id: "TST-008",
    title: "High-input-space behavior",
    statement: "Prefer property, fuzz, metamorphic, combinatorial, or model-based techniques when many inputs share invariant structure.",
    classification: "semantic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "property",
      cadence: "pull_request",
      failure_class: "input-space-invariant"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "PLC-001",
    title: "Cheapest valid scope",
    statement: "Choose the least expensive scope that can trigger the relevant failure mechanism and observe the contract.",
    classification: "semantic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: {},
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "PLC-002",
    title: "Do not test below the failure boundary",
    statement: "Reject a lower-level test when the failure requires real wiring, state, or environment.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: null,
    targetConstraints: {},
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "CHG-001",
    title: "Documentation/comments",
    statement: "Documentation or comment-only changes default to NO_TEST unless executable documentation or generated contracts change.",
    classification: "deterministic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "no_test",
    target: null,
    obligationAxes: null
  },
  {
    id: "CHG-002",
    title: "Formatting/mechanical refactor",
    statement: "Formatting or mechanically proven refactors run affected existing checks and ordinarily add no tests.",
    classification: "deterministic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "no_test",
    target: null,
    obligationAxes: null
  },
  {
    id: "CHG-003",
    title: "Behavior-preserving structural refactor",
    statement: "Preserve existing behavior tests; substantial test churn is a smell.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "no_test",
    target: null,
    obligationAxes: null
  },
  {
    id: "CHG-004",
    title: "New pure behavior",
    statement: "Add or update focused behavior evidence for meaningful partitions and invariants.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "CHG-005",
    title: "Confirmed bug",
    statement: "Find why evidence missed the bug and add one guard for that failure class only when needed.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "narrow",
      purpose: "regression",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "CHG-006",
    title: "Boundary/dependency change",
    statement: "Test at the real boundary or contract; mocks serve fault injection or rare states, not wiring proof.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "regression",
      technique: "example",
      cadence: "pull_request",
      failure_class: "boundary-regression"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary"
    }
  },
  {
    id: "CHG-007",
    title: "Schema/migration change",
    statement: "Use compatibility, migration, rollback, and data-preservation evidence where applicable.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "migration",
      technique: "example",
      cadence: "pull_request",
      failure_class: "migration-compatibility"
    },
    obligationAxes: {
      consequence: "irreversible",
      exposure: "cross_system",
      change_mechanism: "stateful_or_irreversible"
    }
  },
  {
    id: "CHG-008",
    title: "Concurrency/ordering change",
    statement: "Use deterministic invariant evidence plus stress or schedule exploration when practical.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "resilience",
      technique: "property",
      cadence: "nightly",
      failure_class: "ordering-invariant"
    },
    obligationAxes: {
      consequence: "irreversible",
      exposure: "cross_system",
      change_mechanism: "stateful_or_irreversible"
    }
  },
  {
    id: "CHG-009",
    title: "Security-sensitive change",
    statement: "Derive tests from a declared or observed threat at the reachable boundary.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "integration",
      purpose: "security",
      technique: "example",
      cadence: "pull_request",
      failure_class: "reachable-security-failure"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "adversarial",
      change_mechanism: "boundary"
    }
  },
  {
    id: "CHG-010",
    title: "Generated code",
    statement: "Test the generator or contract rather than every generated line unless artifacts are independently owned.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "contract",
      purpose: "compatibility",
      technique: "example",
      cadence: "pull_request",
      failure_class: "generator-contract"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "cross_system",
      change_mechanism: "boundary"
    }
  },
  {
    id: "CHG-011",
    title: "Configuration/deployment change",
    statement: "Use validation, smoke, and production-like wiring evidence rather than source-level unit tests.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "recommend",
    notAppliesAction: "no_test",
    target: {
      scope: "system",
      purpose: "smoke",
      technique: "example",
      cadence: "release",
      failure_class: "deployment-wiring"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "boundary"
    }
  },
  {
    id: "NTT-001",
    title: "Uncustomized dependency behavior",
    statement: "Do not test framework, language, ORM, serializer, client, or standard-library behavior the repository does not customize.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-002",
    title: "Trivial accessors and pass-throughs",
    statement: "Do not test trivial getters, setters, constants, aliases, or pass-throughs without policy, transformation, side effect, or compatibility obligation.",
    classification: "deterministic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-003",
    title: "Private methods and call order",
    statement: "Do not freeze private methods or internal call order when public behavior captures the contract.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-004",
    title: "Compile/type guarantees",
    statement: "Do not repeat compiler or type-system guarantees at runtime unless untyped/serialized input crosses a boundary.",
    classification: "deterministic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-005",
    title: "Mock interaction theater",
    statement: "Do not assert every internal mock call when state, output, or external contract matters.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-006",
    title: "Coverage chasing",
    statement: "Do not add cases solely to execute every syntactic branch.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-007",
    title: "Duplicate equivalence examples",
    statement: "Do not add multiple examples from one equivalence class without a new boundary, invariant, or domain distinction.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-008",
    title: "Cross-layer duplication",
    statement: "Do not repeat the same behavior at unit, integration, and E2E scopes unless each detects a distinct failure mechanism.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-009",
    title: "Blind snapshots",
    statement: "Do not rely on broad snapshots without a named semantic contract and review process.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-010",
    title: "Speculative edge cases",
    statement: "Do not generate edge cases with no plausible likelihood or impact.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-011",
    title: "Replacement-freeze tests",
    statement: "Do not add tests whose only purpose is to freeze internals during planned replacement; characterize the replacement boundary.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  },
  {
    id: "NTT-012",
    title: "File-changed test reflex",
    statement: "Do not create a test solely because an agent edited a file.",
    classification: "heuristic",
    lowConfidenceBehavior: "Emit advisory or INSUFFICIENT_EVIDENCE; never gate.",
    appliesAction: "no_test",
    notAppliesAction: "recommend",
    target: {
      scope: "narrow",
      purpose: "functional",
      technique: "example",
      cadence: "pull_request",
      failure_class: "distinct-behavior"
    },
    obligationAxes: {
      consequence: "degraded",
      exposure: "user_facing",
      change_mechanism: "pure_behavior"
    }
  }
];
var POLICY_RULES_BY_ID = new Map(
  POLICY_RULES.map((rule2) => [rule2.id, rule2])
);

// src/core/policy/index.ts
var NULL_TARGET = {
  scope: null,
  purpose: null,
  technique: null,
  cadence: null,
  failure_class: null,
  test_path: null
};
var PROVENANCE_TO_AXIS = {
  declared: "explicit",
  observed: "observed",
  derived: "derived",
  inferred: "inferred",
  unknown: "unknown"
};
var PROVENANCE_TO_DECISION_CONFIDENCE = {
  declared: "high",
  observed: "high",
  derived: "medium",
  inferred: "low",
  unknown: "low"
};
function getRule(ruleId) {
  const rule2 = POLICY_RULES_BY_ID.get(ruleId);
  if (rule2 === void 0) {
    throw new Error(`Unknown policy rule: ${ruleId}`);
  }
  return rule2;
}
function deriveProvenance(det) {
  if ((det.declaredRefs?.length ?? 0) > 0) return "declared";
  if ((det.observedRefs?.length ?? 0) > 0) return "observed";
  if (det.applicability === "ambiguous") return "unknown";
  return det.fallbackProvenance ?? "derived";
}
function buildEvidence(det, provenance, options) {
  const kind = provenance === "declared" ? "declared_policy" : provenance === "observed" ? "failing_test" : "user_context";
  return {
    schema_version: "1.0",
    id: options.ids.evidence,
    kind,
    status: provenance === "observed" ? "observed" : "available",
    source: {
      tool: "test-steward-policy",
      version: null,
      path: null,
      command_fingerprint: null,
      observed_at: options.observedAt
    },
    findings: [
      {
        code: "RULE_DETERMINATION",
        summary: det.statement,
        paths: [...new Set(det.paths)].sort()
      }
    ],
    data: {
      rule_id: det.ruleId,
      applicability: det.applicability
    },
    gate_trust: provenance === "declared" || provenance === "observed" ? "eligible" : "advisory_only",
    limitations: [
      "Facts were supplied to the policy engine; no repository command was executed."
    ]
  };
}
function targetMatchesConstraints(target, constraints) {
  if (constraints === void 0) return true;
  return Object.entries(constraints).every(
    ([key, value]) => target[key] === value
  );
}
function decideRule(det, options) {
  if (det.existingTestPath !== void 0 && det.sufficientExistingTestPath !== void 0) {
    throw new Error(
      "A rule determination cannot require an existing-test update and mark existing evidence sufficient"
    );
  }
  if (det.sufficientExistingTestPath !== void 0 && det.evidenceGap !== void 0 && det.evidenceGap !== "none") {
    throw new Error(
      "Sufficient existing evidence requires evidenceGap to be none"
    );
  }
  const rule2 = getRule(det.ruleId);
  const mode = options.mode ?? "advisory";
  const elevatedRuleIds = options.elevatedRuleIds ?? [];
  const provenance = deriveProvenance(det);
  const evidence = buildEvidence(det, provenance, options);
  const baseLimitations = det.limitations ?? [];
  const obligationRefs = /* @__PURE__ */ new Set([
    ...det.declaredRefs ?? [],
    ...det.observedRefs ?? []
  ]);
  const sufficientObligationRefs = new Set(
    det.sufficientExistingObligationRefs ?? []
  );
  const resolvedTarget = det.resolvedTarget ?? rule2.target;
  const targetMismatch = resolvedTarget !== null && !targetMatchesConstraints(resolvedTarget, rule2.targetConstraints);
  const recommendTarget = targetMismatch ? null : resolvedTarget;
  const semanticWithoutSupport = (rule2.classification === "semantic" || rule2.classification === "non-automatable") && provenance !== "declared" && provenance !== "observed";
  const unresolved = det.applicability === "ambiguous" || provenance === "unknown" || semanticWithoutSupport;
  const action = unresolved ? "unresolved" : det.applicability === "applies" ? rule2.appliesAction : rule2.notAppliesAction;
  const sufficientExistingEvidence = action === "recommend" && det.sufficientExistingTestPath !== void 0 && det.sufficientExistingFailureClass !== void 0 && recommendTarget !== null && det.sufficientExistingFailureClass === recommendTarget.failure_class && obligationRefs.size > 0 && [...obligationRefs].every(
    (reference) => sufficientObligationRefs.has(reference)
  ) && (provenance === "declared" || provenance === "observed");
  const existingTestPath = det.existingTestPath ?? (sufficientExistingEvidence ? void 0 : det.sufficientExistingTestPath);
  const confidenceAxis = PROVENANCE_TO_AXIS[provenance];
  let axes;
  let distinctChangedObligation;
  if (action === "recommend") {
    if (rule2.obligationAxes === null) {
      throw new Error(`Rule ${rule2.id} recommends but declares no obligation`);
    }
    axes = {
      ...rule2.obligationAxes,
      evidence_gap: recommendTarget === null ? "unknown" : sufficientExistingEvidence ? "none" : det.sufficientExistingTestPath === void 0 ? det.evidenceGap ?? "material" : "material",
      confidence: confidenceAxis
    };
    distinctChangedObligation = recommendTarget !== null;
  } else if (action === "no_test") {
    axes = {
      consequence: "negligible",
      exposure: "internal",
      change_mechanism: det.applicability === "applies" ? "no_behavior" : "pure_behavior",
      evidence_gap: "none",
      confidence: confidenceAxis
    };
    distinctChangedObligation = false;
  } else {
    axes = {
      consequence: "negligible",
      exposure: "internal",
      change_mechanism: "pure_behavior",
      evidence_gap: "unknown",
      confidence: confidenceAxis
    };
    distinctChangedObligation = false;
  }
  const tier = assignTier({ axes, distinctChangedObligation });
  const gateEligible = isGateEligible({
    provenance,
    executableGapDemonstrated: axes.evidence_gap === "material" || axes.evidence_gap === "partial",
    ruleId: rule2.id,
    elevatedRuleIds
  });
  const materialityGateAction = allowedGateAction({
    tier,
    provenance,
    mode,
    gateEligible
  });
  const outcome = sufficientExistingEvidence ? "EXISTING_EVIDENCE_SUFFICIENT" : action === "recommend" && recommendTarget === null ? "INSUFFICIENT_EVIDENCE" : tier === "TU" ? "INSUFFICIENT_EVIDENCE" : tier === "T0" ? "NO_TEST_SUPPORTED" : existingTestPath !== void 0 ? "EXISTING_TEST_UPDATE_CANDIDATE" : "NEW_TEST_CANDIDATE";
  const gateAction = outcome === "EXISTING_EVIDENCE_SUFFICIENT" ? "allow" : materialityGateAction;
  const target = outcome === "EXISTING_EVIDENCE_SUFFICIENT" ? recommendTarget === null ? {
    ...NULL_TARGET,
    technique: "existing_evidence",
    cadence: "completion",
    test_path: det.sufficientExistingTestPath ?? null
  } : {
    ...recommendTarget,
    technique: "existing_evidence",
    test_path: det.sufficientExistingTestPath ?? null
  } : (outcome === "NEW_TEST_CANDIDATE" || outcome === "EXISTING_TEST_UPDATE_CANDIDATE") && recommendTarget !== null ? { ...recommendTarget, test_path: existingTestPath ?? null } : NULL_TARGET;
  const limitations = [...baseLimitations];
  if (action === "recommend" && recommendTarget === null) {
    limitations.push(
      targetMismatch ? "The supplied evidence target conflicts with the policy rule constraints." : "The observed failure mechanism and boundary do not resolve a minimum sufficient evidence target."
    );
  }
  if (det.sufficientExistingTestPath !== void 0 && !sufficientExistingEvidence) {
    limitations.push(
      "Existing evidence was not marked sufficient because it was not explicitly bound to this obligation and failure class."
    );
  }
  if (outcome === "INSUFFICIENT_EVIDENCE") {
    limitations.push(rule2.lowConfidenceBehavior);
  }
  const remediation = gateAction === "request_remediation" && target.scope !== null ? outcome === "EXISTING_TEST_UPDATE_CANDIDATE" && target.test_path !== null ? `Inspect and update ${target.test_path} for ${target.failure_class ?? "the changed obligation"} (${rule2.id}); do not add a separate test unless it detects a distinct failure mechanism.` : `Add ${target.scope}-scope ${target.purpose ?? "functional"} evidence covering ${target.failure_class ?? "the changed obligation"} (${rule2.id}).` : null;
  const obligation = provenance === "unknown" ? null : {
    schema_version: "1.0",
    id: options.ids.obligation,
    title: rule2.title,
    statement: det.statement,
    provenance,
    source_refs: [
      .../* @__PURE__ */ new Set([
        ...det.declaredRefs ?? [],
        ...det.observedRefs ?? [],
        options.ids.evidence
      ])
    ],
    materiality: { ...axes, tier },
    gate_eligible: gateEligible,
    rationale: options.presentation.rationale,
    limitations: [...limitations]
  };
  const decision = {
    schema_version: "1.0",
    id: options.ids.decision,
    domain: "change",
    outcome,
    gate_action: gateAction,
    confidence: PROVENANCE_TO_DECISION_CONFIDENCE[provenance],
    reason_code: options.presentation.reasonCode,
    summary: options.presentation.summary,
    rationale: options.presentation.rationale,
    remediation,
    obligation_candidate_ids: obligation === null ? [] : [obligation.id],
    evidence_ids: [evidence.id],
    target,
    cleanup_requirements: null,
    limitations
  };
  return { decision, obligation, evidence };
}

// src/analysis/test-path.ts
var TEST_FILE_PATTERN = /(^|\/)[^/]*\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
var TEST_DIRECTORY_PATTERN = /(^|\/)__tests__\/[^/]+\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
function isTestFilePath(file) {
  return TEST_FILE_PATTERN.test(file) || TEST_DIRECTORY_PATTERN.test(file);
}

// src/analysis/change-classifier.ts
var DOC_PATH_PATTERN = /(^|\/)(license|notice|changelog|code_of_conduct|contributing)$|\.(md|markdown|mdx|txt|rst|adoc)$/i;
var DOCS_DIRECTORY_PATTERN = /(^|\/)docs?\//i;
var JS_TS_SOURCE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
var DEPENDENCY_MANIFEST_PATTERN = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/;
var SECURITY_PATH_PATTERN = /(auth|security|crypt|token|permission|acl|session|signature)/i;
var CONCURRENCY_PATH_PATTERN = /(queue|lock|mutex|semaphore|concurren|worker|scheduler)/i;
function isDocPath(path10) {
  return DOC_PATH_PATTERN.test(path10) || DOCS_DIRECTORY_PATTERN.test(path10);
}
function rule(id) {
  const found = POLICY_RULES_BY_ID.get(id);
  if (found === void 0) {
    throw new Error(`Unknown policy rule: ${id}`);
  }
  return found;
}
function classification(ruleId, provenance, confidence, paths, rationale) {
  return {
    ruleId,
    title: rule(ruleId).title,
    provenance,
    confidence,
    paths: [...new Set(paths)].sort(),
    rationale
  };
}
function classifyChangeSet(input) {
  const classes = [];
  const limitations = [];
  const changedPaths = input.changedFiles.map((file) => file.path);
  const runtimeEquivalentPaths = new Set(input.runtimeEquivalentPaths ?? []);
  const boundariesByFile = /* @__PURE__ */ new Map();
  for (const fact of input.boundaries?.boundaries ?? []) {
    const kinds = boundariesByFile.get(fact.file) ?? /* @__PURE__ */ new Set();
    kinds.add(fact.kind);
    boundariesByFile.set(fact.file, kinds);
  }
  const pathsWithBoundary = (kinds) => changedPaths.filter(
    (path10) => kinds.some((kind) => boundariesByFile.get(path10)?.has(kind))
  );
  if (changedPaths.length === 0) {
    return { classes: [], limitations: ["The change set is empty."] };
  }
  if (changedPaths.every(isDocPath)) {
    classes.push(
      classification(
        "CHG-001",
        "derived",
        "high",
        changedPaths,
        "Every changed path is documentation."
      )
    );
    return { classes, limitations };
  }
  const migrationPaths = pathsWithBoundary([
    "migration",
    "schema-serialization"
  ]);
  if (migrationPaths.length > 0) {
    classes.push(
      classification(
        "CHG-007",
        "derived",
        "high",
        migrationPaths,
        "Changed paths carry migration or schema/serialization boundary facts."
      )
    );
  }
  const generatedPaths = pathsWithBoundary(["generated-code"]);
  if (generatedPaths.length > 0) {
    classes.push(
      classification(
        "CHG-010",
        "derived",
        "high",
        generatedPaths,
        "Changed paths are marked as generated code."
      )
    );
    limitations.push(
      "Generation provenance (generator source mapping) is not verified."
    );
  }
  const configPaths = pathsWithBoundary(["config"]);
  if (configPaths.length > 0) {
    classes.push(
      classification(
        "CHG-011",
        "derived",
        "high",
        configPaths,
        "Changed paths carry configuration boundary facts."
      )
    );
  }
  const boundaryPaths = [
    ...pathsWithBoundary(["route-registration", "route-handler-export"]),
    ...changedPaths.filter((path10) => DEPENDENCY_MANIFEST_PATTERN.test(path10))
  ];
  if (boundaryPaths.length > 0) {
    classes.push(
      classification(
        "CHG-006",
        "derived",
        "high",
        boundaryPaths,
        "Changed paths carry route boundary facts or dependency manifests."
      )
    );
  }
  const observedFailurePaths = input.observedFailurePaths ?? [];
  if (observedFailurePaths.length > 0) {
    classes.push(
      classification(
        "CHG-005",
        "observed",
        "high",
        observedFailurePaths,
        "A reproduced failure was supplied for these paths."
      )
    );
  } else {
    limitations.push(
      "CHG-005 (confirmed bug) requires a supplied reproduced failure; none was provided."
    );
  }
  if (runtimeEquivalentPaths.size > 0) {
    classes.push(
      classification(
        "CHG-002",
        "derived",
        "high",
        [...runtimeEquivalentPaths],
        "Before and after TypeScript revisions emit identical JavaScript."
      )
    );
    limitations.push(
      "Runtime-emit equivalence does not prove type-level API compatibility; run the repository typecheck."
    );
  }
  const addedPurePaths = input.changedFiles.filter(
    (file) => file.status === "added" && JS_TS_SOURCE_PATTERN.test(file.path) && !isTestFilePath(file.path) && !runtimeEquivalentPaths.has(file.path) && !boundariesByFile.has(file.path)
  ).map((file) => file.path);
  if (addedPurePaths.length > 0) {
    classes.push(
      classification(
        "CHG-004",
        "derived",
        "medium",
        addedPurePaths,
        "New source files without boundary facts add behavior."
      )
    );
    limitations.push(
      "Purity of new behavior is not proven; hidden I/O is possible."
    );
  }
  const securityPaths = changedPaths.filter(
    (path10) => SECURITY_PATH_PATTERN.test(path10) && JS_TS_SOURCE_PATTERN.test(path10) && !isTestFilePath(path10) && !runtimeEquivalentPaths.has(path10)
  );
  if (securityPaths.length > 0) {
    classes.push(
      classification(
        "CHG-009",
        "inferred",
        "low",
        securityPaths,
        "Path names suggest security relevance; no declared or observed threat is known."
      )
    );
  }
  const concurrencyPaths = changedPaths.filter(
    (path10) => CONCURRENCY_PATH_PATTERN.test(path10) && JS_TS_SOURCE_PATTERN.test(path10) && !isTestFilePath(path10) && !runtimeEquivalentPaths.has(path10)
  );
  if (concurrencyPaths.length > 0) {
    classes.push(
      classification(
        "CHG-008",
        "inferred",
        "low",
        concurrencyPaths,
        "Path names suggest concurrency or ordering behavior."
      )
    );
  }
  const sourceChanged = changedPaths.some(
    (path10) => JS_TS_SOURCE_PATTERN.test(path10) && !isTestFilePath(path10) && !runtimeEquivalentPaths.has(path10)
  );
  if (sourceChanged) {
    limitations.push(
      "CHG-002 (formatting/mechanical refactor) is not asserted: AST equivalence against the base revision is not computed.",
      "CHG-003 (behavior-preserving refactor) is not asserted: behavior preservation cannot be established statically."
    );
  }
  return { classes, limitations };
}

// src/evidence/verdict.ts
var ConfigInvalidError = class extends Error {
  constructor(detail) {
    super(`Configuration ${detail}`);
    this.name = "ConfigInvalidError";
  }
};
function policyFingerprint(source) {
  return `sha256:${createHash3("sha256").update(source).digest("hex")}`;
}
var DEFAULT_POLICY_FINGERPRINT = policyFingerprint(
  '{"mode":"advisory","elevatedRuleIds":[],"criticalPaths":[],"declaredObligations":[]}'
);
var UNTRUSTED_DEFAULTS = {
  mode: "advisory",
  baseRevision: void 0,
  elevatedRuleIds: [],
  criticalPaths: [],
  declaredObligations: [],
  runRepositoryCommands: false,
  mutationRequested: false,
  configPath: null,
  policyFingerprint: DEFAULT_POLICY_FINGERPRINT,
  explicit: false
};
var CONFIG_SIZE_LIMIT = 1048576;
async function readValidatedConfig(repoRoot, configPath) {
  const root = await realpath4(repoRoot);
  let relative;
  let resolved;
  try {
    resolved = await realpath4(path6.resolve(root, configPath));
    relative = normalizeRepositoryPath(path6.relative(root, resolved));
  } catch (error) {
    if (error instanceof PathContainmentError) {
      throw new ConfigInvalidError(error.message);
    }
    throw error;
  }
  if (path6.extname(resolved) !== ".json") {
    throw new ConfigInvalidError(`must be inert JSON (.json): ${configPath}`);
  }
  let source;
  try {
    source = await readContainedRegularFile(root, relative, CONFIG_SIZE_LIMIT);
  } catch (error) {
    if (error instanceof PathContainmentError) {
      throw new ConfigInvalidError(error.message);
    }
    throw error;
  }
  let document;
  try {
    document = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new ConfigInvalidError(
      `is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const validate = await getValidator("config.schema.json");
  if (!validate(document)) {
    throw new ConfigInvalidError(
      `failed schema validation: ${formatSchemaErrors(validate.errors)}`
    );
  }
  return {
    raw: document,
    relative,
    policyFingerprint: policyFingerprint(source)
  };
}
var DISCOVERED_CONFIG_PATH = ".detestify/config.json";
async function loadTrust(repoRoot, explicitConfigPath) {
  if (explicitConfigPath !== void 0) {
    const { raw, relative, policyFingerprint: policyFingerprint2 } = await readValidatedConfig(
      repoRoot,
      explicitConfigPath
    );
    const trustedOperations = raw.trusted_operations;
    const runRepositoryCommands = trustedOperations.run_repository_commands && trustedOperations.evaluate_repository_config && trustedOperations.network_access;
    const partialRunnerGrant = !runRepositoryCommands && (trustedOperations.run_repository_commands || trustedOperations.evaluate_repository_config || trustedOperations.network_access);
    return {
      mode: raw.mode,
      baseRevision: raw.base_revision ?? void 0,
      elevatedRuleIds: raw.policy.elevated_rule_ids,
      criticalPaths: raw.critical_paths,
      declaredObligations: raw.declared_obligations,
      runRepositoryCommands,
      mutationRequested: trustedOperations.mutation,
      configPath: relative,
      policyFingerprint: policyFingerprint2,
      explicit: true,
      limitations: partialRunnerGrant ? [
        "Repository test execution requires run_repository_commands, evaluate_repository_config, and network_access together; the partial grant was treated as report-only."
      ] : []
    };
  }
  try {
    const { raw, relative, policyFingerprint: policyFingerprint2 } = await readValidatedConfig(
      repoRoot,
      DISCOVERED_CONFIG_PATH
    );
    const limitations = [];
    if (raw.trusted_operations.run_repository_commands || raw.trusted_operations.evaluate_repository_config || raw.trusted_operations.network_access || raw.trusted_operations.mutation) {
      limitations.push(
        "Discovered repository configuration cannot grant execution trust; pass --config explicitly to run repository commands."
      );
    }
    return {
      mode: raw.mode,
      baseRevision: raw.base_revision ?? void 0,
      elevatedRuleIds: raw.policy.elevated_rule_ids,
      criticalPaths: raw.critical_paths,
      declaredObligations: raw.declared_obligations,
      runRepositoryCommands: false,
      mutationRequested: false,
      configPath: relative,
      policyFingerprint: policyFingerprint2,
      explicit: false,
      limitations
    };
  } catch (error) {
    if (error instanceof ConfigInvalidError) {
      return {
        ...UNTRUSTED_DEFAULTS,
        limitations: [
          `Discovered configuration ${DISCOVERED_CONFIG_PATH} was ignored: ${error.message}`
        ]
      };
    }
    return { ...UNTRUSTED_DEFAULTS, limitations: [] };
  }
}
var OWN_STATE_PREFIX = ".detestify";
function stripOwnState(snapshot) {
  const changedFiles = snapshot.changedFiles.filter(
    (file) => file.path !== OWN_STATE_PREFIX && !file.path.startsWith(`${OWN_STATE_PREFIX}/`)
  );
  return { ...snapshot, changedFiles };
}
function globToRegExp(pattern) {
  const escaped = pattern.split("**").map(
    (part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")
  ).join(".*");
  return new RegExp(`^${escaped}$`);
}
var ACTION_RANK = {
  allow: 0,
  advise: 1,
  request_remediation: 2,
  deny_tool: 2
};
var TIER_RANK = {
  T0: 0,
  TU: 1,
  T1: 2,
  T2: 3,
  T3: 4,
  T4: 5
};
function reasonCodeFor(ruleId) {
  if (ruleId === "CHG-002") return "RUNTIME_EMIT_UNCHANGED";
  return ruleId.replace(/-/g, "_");
}
function evaluatePlanStage(input) {
  const { snapshot, trust, observedAt, changedTestFiles, idPrefix } = input;
  const limitations = [];
  const determinations = [];
  const classified = classifyChangeSet({
    changedFiles: snapshot.changedFiles,
    ...input.runtimeEquivalentPaths === void 0 ? {} : { runtimeEquivalentPaths: input.runtimeEquivalentPaths }
  });
  limitations.push(...classified.limitations);
  const changedTests = new Set(changedTestFiles);
  const obligationsById = new Map(
    trust.declaredObligations.map((obligation) => [obligation.id, obligation])
  );
  const declaredRefsFor = (paths) => trust.criticalPaths.flatMap((rule2) => {
    const matcher = globToRegExp(rule2.pattern);
    if (!paths.some((file) => matcher.test(file))) {
      return [];
    }
    return rule2.obligation_ids.flatMap((id) => {
      const declared = obligationsById.get(id);
      return [declared === void 0 ? id : `${id}:${declared.source}`];
    });
  });
  const evidenceDispositionFor = (paths) => {
    const determinations2 = [
      ...(input.relevantChangedTests ?? []).map((relation) => ({
        ...relation,
        disposition: "update"
      })),
      ...input.existingEvidenceDeterminations ?? []
    ].filter((relation) => paths.includes(relation.changedPath));
    const update = determinations2.filter(
      (relation) => relation.disposition === "update" && changedTests.has(relation.testPath)
    ).map((relation) => relation.testPath).sort()[0];
    if (update !== void 0) {
      return { existingTestPath: update, evidenceGap: "partial" };
    }
    const candidate = determinations2.filter(
      (relation) => relation.disposition === "candidate" && !changedTests.has(relation.testPath)
    ).map((relation) => relation.testPath).sort()[0];
    if (candidate !== void 0) {
      return { existingTestPath: candidate, evidenceGap: "partial" };
    }
    const sufficient = determinations2.filter(
      (relation) => relation.disposition === "sufficient" && !changedTests.has(relation.testPath)
    ).sort((left, right) => left.testPath.localeCompare(right.testPath))[0];
    return sufficient !== void 0 ? {
      sufficientExistingTestPath: sufficient.testPath,
      ...sufficient.obligationRefs === void 0 ? {} : {
        sufficientExistingObligationRefs: sufficient.obligationRefs
      },
      ...sufficient.failureClass === void 0 ? {} : { sufficientExistingFailureClass: sufficient.failureClass }
    } : { evidenceGap: "material" };
  };
  for (const classification2 of classified.classes) {
    const declaredRefs = declaredRefsFor(classification2.paths);
    const existingEvidence = evidenceDispositionFor(classification2.paths);
    determinations.push({
      det: {
        ruleId: classification2.ruleId,
        applicability: "applies",
        statement: classification2.rationale,
        paths: classification2.paths,
        ...classification2.provenance === "observed" ? { observedRefs: classification2.paths } : { fallbackProvenance: classification2.provenance },
        ...declaredRefs.length > 0 ? { declaredRefs } : {},
        ...existingEvidence
      },
      reasonCode: reasonCodeFor(classification2.ruleId),
      summary: classification2.rationale
    });
  }
  const changedNonTestPaths = snapshot.changedFiles.map((file) => file.path).filter((file) => !isTestFilePath(file));
  for (const rule2 of trust.criticalPaths) {
    const matcher = globToRegExp(rule2.pattern);
    const matched = changedNonTestPaths.filter((file) => matcher.test(file));
    if (matched.length === 0) {
      continue;
    }
    const declaredRefs = rule2.obligation_ids.map((id) => {
      const declared = obligationsById.get(id);
      return declared === void 0 ? id : `${id}:${declared.source}`;
    });
    const existingEvidence = evidenceDispositionFor(matched);
    determinations.push({
      det: {
        ruleId: "TST-001",
        applicability: "applies",
        statement: `Changed paths match declared critical path ${rule2.pattern}.`,
        paths: matched,
        declaredRefs,
        ...existingEvidence
      },
      reasonCode: "DECLARED_CRITICAL_PATH_CHANGED",
      summary: `Declared critical path ${rule2.pattern} changed without verified evidence.`
    });
  }
  const evaluations = determinations.map(
    (entry, index) => decideRule(entry.det, {
      mode: trust.mode,
      elevatedRuleIds: trust.elevatedRuleIds,
      observedAt,
      ids: {
        decision: `${idPrefix}-decision-${index + 1}`,
        obligation: `${idPrefix}-obligation-${index + 1}`,
        evidence: `${idPrefix}-evidence-${index + 1}`
      },
      presentation: {
        reasonCode: entry.reasonCode,
        summary: entry.summary.slice(0, 500),
        rationale: entry.det.statement
      }
    })
  );
  let strongest = null;
  for (const evaluation of evaluations) {
    if (strongest === null) {
      strongest = evaluation.decision;
      continue;
    }
    const candidate = evaluation.decision;
    const candidateTier = evaluation.obligation?.materiality.tier ?? "TU";
    const strongestEvaluation = evaluations.find(
      (entry) => entry.decision === strongest
    );
    const strongestTier = strongestEvaluation?.obligation?.materiality.tier ?? "TU";
    if (ACTION_RANK[candidate.gate_action] > ACTION_RANK[strongest.gate_action] || ACTION_RANK[candidate.gate_action] === ACTION_RANK[strongest.gate_action] && TIER_RANK[candidateTier] > TIER_RANK[strongestTier]) {
      strongest = candidate;
    }
  }
  return {
    decisions: evaluations.map((evaluation) => evaluation.decision),
    obligations: evaluations.flatMap(
      (evaluation) => evaluation.obligation === null ? [] : [evaluation.obligation]
    ),
    evidence: evaluations.map((evaluation) => evaluation.evidence),
    ruleIds: determinations.map((entry) => entry.det.ruleId),
    strongestAction: strongest?.gate_action ?? "allow",
    strongestDecision: strongest,
    limitations
  };
}

// src/hooks/normalized.ts
var HOOK_SCHEMA_VERSION = "1.0";
var HookEnvelopeError = class extends Error {
  constructor(branch, errors) {
    super(
      `Hook ${branch} failed schema validation: ${formatSchemaErrors([
        ...errors
      ])}`
    );
    this.branch = branch;
    this.name = "HookEnvelopeError";
  }
};
var cachedValidator;
async function getValidators() {
  cachedValidator ??= await getValidator("hook-io.schema.json");
  return cachedValidator;
}
async function parseInvocation(value) {
  const validate = await getValidators();
  if (validate(value)) {
    return value;
  }
  throw new HookEnvelopeError("invocation", validate.errors ?? []);
}
async function parseDecision(value) {
  const validate = await getValidators();
  if (validate(value)) {
    return value;
  }
  throw new HookEnvelopeError("decision", validate.errors ?? []);
}
async function buildInvocation(fields) {
  const invocation = {
    schema_version: HOOK_SCHEMA_VERSION,
    host: fields.host,
    host_version: fields.host_version,
    event: fields.event,
    session_id: fields.session_id,
    turn_id: fields.turn_id,
    cwd: fields.cwd,
    repo_root: fields.repo_root,
    tool: {
      name: fields.tool?.name ?? null,
      input_ref: fields.tool?.input_ref ?? null,
      result_ref: fields.tool?.result_ref ?? null
    },
    loop_guard: fields.loop_guard,
    raw_payload_ref: fields.raw_payload_ref
  };
  return parseInvocation(invocation);
}
async function buildDecision(fields) {
  const decision = {
    schema_version: HOOK_SCHEMA_VERSION,
    action: fields.action,
    confidence: fields.confidence,
    reason_code: fields.reason_code,
    summary: fields.summary,
    remediation: fields.remediation,
    report_path: fields.report_path,
    limitations: fields.limitations ?? [],
    loop_guard: {
      next_attempt: Math.min(1, Math.max(0, fields.loop_guard.next_attempt)),
      max_attempts: 2
    }
  };
  return parseDecision(decision);
}

// src/hooks/loop-state.ts
import { createHash as createHash4 } from "node:crypto";
import path7 from "node:path";
var STATE_TTL_MS = 24 * 60 * 60 * 1e3;
var STATE_MAX_BYTES = 1024 * 1024;
function emptyState() {
  return { version: 1, remediated: {}, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
}
function isPersistedState(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value;
  return Object.keys(value).sort().join(",") === "remediated,updated_at,version" && candidate.version === 1 && typeof candidate.remediated === "object" && candidate.remediated !== null && !Array.isArray(candidate.remediated) && Object.values(candidate.remediated).every(
    (timestamp) => typeof timestamp === "number" && Number.isSafeInteger(timestamp) && timestamp >= 0
  ) && typeof candidate.updated_at === "string" && Number.isFinite(Date.parse(candidate.updated_at));
}
function diffFingerprint(source) {
  return createHash4("sha256").update(source ?? "").digest("hex");
}
function identityFingerprint(identity) {
  const normalized = identity?.normalize("NFC").trim() ?? "";
  return normalized === "" ? null : diffFingerprint(normalized);
}
function loopKey(invocation, agentId) {
  return {
    host: invocation.host,
    sessionId: invocation.session_id,
    repoFingerprint: invocation.repo_root === null ? "no-repository" : diffFingerprint(invocation.repo_root),
    agentId: identityFingerprint(agentId ?? null)
  };
}
function keyString(key) {
  return [
    key.host,
    key.sessionId ?? "-",
    key.repoFingerprint,
    key.agentId ?? "-"
  ].map((part) => encodeURIComponent(part)).join("/");
}
function stateFilePath(repoRoot, overrideDir) {
  if (overrideDir !== void 0) {
    if (!path7.isAbsolute(overrideDir)) {
      throw new Error(
        "Loop state directory override must be an absolute path."
      );
    }
    return path7.join(overrideDir, "hooks", "loop-state.json");
  }
  if (repoRoot === null) {
    throw new Error(
      "Loop state directory unavailable: no repository root for repository-keyed state."
    );
  }
  return path7.join(
    repositoryStateDirectory(repoRoot),
    "hooks",
    "loop-state.json"
  );
}
async function readState(file) {
  const stateRoot = path7.dirname(path7.dirname(file));
  let text;
  try {
    text = await readPrivateTextFile(file, stateRoot, STATE_MAX_BYTES);
  } catch {
    return {
      state: emptyState(),
      limitations: [
        "Loop state file was unavailable or insecure; remediation disabled for this stop."
      ],
      available: false
    };
  }
  if (text === null) {
    return { state: emptyState(), limitations: [], available: true };
  }
  try {
    const parsed = JSON.parse(text);
    if (isPersistedState(parsed)) {
      return { state: parsed, limitations: [], available: true };
    }
  } catch {
  }
  return {
    state: emptyState(),
    limitations: [
      "Loop state file was corrupt; remediation disabled for this stop."
    ],
    available: false
  };
}
async function writeStateAtomic(file, state) {
  await writePrivateJsonAtomic(file, state, path7.dirname(path7.dirname(file)));
}
function liveEntries(remediated, now) {
  return Object.fromEntries(
    Object.entries(remediated).filter(
      ([, timestamp]) => now - timestamp <= STATE_TTL_MS
    )
  );
}
async function inspectLoopState(key, options) {
  let file;
  try {
    file = stateFilePath(options.repoRoot, options.stateDir);
  } catch {
    return {
      alreadyRemediated: options.alreadyRemediated,
      nextAttempt: 0,
      limitations: [
        "Loop state directory unavailable; remediation disabled for this stop."
      ]
    };
  }
  const { state, limitations, available } = await readState(file);
  if (!available) {
    return {
      alreadyRemediated: true,
      nextAttempt: 0,
      limitations
    };
  }
  const now = options.now ?? Date.now();
  const recorded = state.remediated[keyString(key)];
  const live = recorded !== void 0 && now - recorded <= STATE_TTL_MS;
  return {
    alreadyRemediated: live || options.alreadyRemediated,
    nextAttempt: live ? 1 : 0,
    limitations
  };
}
async function recordRemediation(key, options) {
  if (options.alreadyRemediated) {
    return false;
  }
  try {
    const file = stateFilePath(options.repoRoot, options.stateDir);
    const stateRoot = path7.dirname(path7.dirname(file));
    const lockFile = path7.join(path7.dirname(file), "loop-state.lock");
    return await withPrivateFileLock(lockFile, stateRoot, async () => {
      const { state, available } = await readState(file);
      if (!available) {
        return false;
      }
      const now = options.now ?? Date.now();
      const id = keyString(key);
      const recorded = state.remediated[id];
      if (recorded !== void 0 && now - recorded <= STATE_TTL_MS) {
        return false;
      }
      const remediated = liveEntries({ ...state.remediated, [id]: now }, now);
      await writeStateAtomic(file, {
        version: 1,
        remediated,
        updated_at: new Date(now).toISOString()
      });
      return true;
    });
  } catch {
    return false;
  }
}
async function clearSessionState(host, sessionId, options) {
  try {
    const file = stateFilePath(options.repoRoot, options.stateDir);
    const stateRoot = path7.dirname(path7.dirname(file));
    const lockFile = path7.join(path7.dirname(file), "loop-state.lock");
    await withPrivateFileLock(lockFile, stateRoot, async () => {
      const { state, available } = await readState(file);
      if (!available) {
        return;
      }
      const sessionPart = encodeURIComponent(sessionId ?? "-");
      const hostPart = encodeURIComponent(host);
      const remediated = Object.fromEntries(
        Object.entries(state.remediated).filter(([id]) => {
          const [idHost, idSession] = id.split("/");
          return idHost !== hostPart || idSession !== sessionPart;
        })
      );
      await writeStateAtomic(file, {
        version: 1,
        remediated,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
  } catch {
  }
}

// src/security/redaction.ts
var REDACTED = "[REDACTED]";
var secretKeyPattern = /(?:secret|passw(?:or)?d|pwd|token|api[-_]?key|auth(?:orization)?|credential|private[-_]?key|cookie)/i;
function redactHomePath(match) {
  const rest = match.replace(/^\/(?:Users|home)\/[^/]+/, "");
  return `~${rest}`;
}
var valuePatterns = [
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED KEY]"
  },
  {
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9]{16,}\b/g,
    replacement: "[REDACTED TOKEN]"
  },
  {
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/g,
    replacement: "[REDACTED TOKEN]"
  },
  {
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    replacement: "[REDACTED TOKEN]"
  },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED TOKEN]" },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
    replacement: "[REDACTED TOKEN]"
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: `Bearer ${REDACTED}`
  },
  {
    pattern: /\b(SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|ACCESS_KEY)[\s]*=[\s]*[^\s,;"']+/gi,
    replacement: "$1=[REDACTED]"
  },
  { pattern: /"(\/(?:Users|home)\/[^/\s"',`)]+)/g, replacement: '"~' },
  {
    pattern: /(?<![\w~"])(\/(?:Users|home)\/[^/\s"',`)]+)/g,
    replacement: (match) => redactHomePath(match)
  }
];
function redactText(text) {
  let result = text;
  for (const { pattern, replacement } of valuePatterns) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
function redactJson(value) {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJson(item));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const source = value;
  const result = {};
  for (const [key, item] of Object.entries(source)) {
    result[key] = secretKeyPattern.test(key) ? REDACTED : redactJson(item);
  }
  return result;
}

// src/hooks/claude/adapter.ts
var CLAUDE_EVENT_MAP = {
  SessionStart: "session_start",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  TaskCompleted: "task_complete",
  SubagentStop: "subagent_stop",
  Stop: "turn_stop",
  SessionEnd: "session_end"
};
var CLAUDE_SUPPORTED_EVENTS = [
  "session_start",
  "before_tool",
  "after_tool",
  "task_complete",
  "subagent_stop",
  "turn_stop",
  "session_end"
];
function field(raw, key) {
  return raw[key];
}
function optionalString(raw, key) {
  const value = field(raw, key);
  return typeof value === "string" ? value : null;
}
async function normalizeClaudeInput(raw, declaredEvent, context) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Claude hook payload must be a JSON object.");
  }
  if (!CLAUDE_SUPPORTED_EVENTS.includes(declaredEvent)) {
    throw new Error(
      `Claude adapter does not support normalized event: ${declaredEvent}`
    );
  }
  const rawName = optionalString(raw, "hook_event_name");
  if (rawName !== null) {
    const mapped = CLAUDE_EVENT_MAP[rawName];
    if (mapped === void 0) {
      throw new Error(`Unknown Claude hook event in payload: ${rawName}`);
    }
    if (mapped !== declaredEvent) {
      throw new Error(
        `Claude payload event ${rawName} does not match hook event ${declaredEvent}.`
      );
    }
  }
  const payloadCwd = optionalString(raw, "cwd");
  const cwd = payloadCwd !== null && payloadCwd.startsWith("/") ? payloadCwd : context.cwd;
  const alreadyRemediated = field(raw, "stop_hook_active") === true;
  const isToolEvent = declaredEvent === "before_tool" || declaredEvent === "after_tool";
  const toolName = isToolEvent ? optionalString(raw, "tool_name") : null;
  const toolInput = isToolEvent ? field(raw, "tool_input") : void 0;
  const toolResponse = isToolEvent ? field(raw, "tool_response") : void 0;
  const inputRef = isToolEvent && toolInput !== void 0 && toolInput !== null ? await context.store(redactJson(toolInput), "claude-tool-input") : null;
  const resultRef = isToolEvent && toolResponse !== void 0 && toolResponse !== null ? await context.store(redactJson(toolResponse), "claude-tool-result") : null;
  const rawPayloadRef = await context.store(
    redactJson(raw),
    `claude-${declaredEvent}`
  );
  return buildInvocation({
    host: "claude",
    host_version: context.hostVersion,
    event: declaredEvent,
    session_id: optionalString(raw, "session_id"),
    // Claude payloads carry no turn identifier in the current release.
    turn_id: null,
    cwd,
    repo_root: context.repoRoot,
    tool: {
      name: toolName,
      input_ref: inputRef,
      result_ref: resultRef
    },
    loop_guard: {
      already_remediated: alreadyRemediated,
      attempt: alreadyRemediated ? 1 : 0
    },
    raw_payload_ref: rawPayloadRef
  });
}
var ALLOW = { stdout: null, stderr: null, exitCode: 0 };
var CLAUDE_BLOCK_EVENTS = /* @__PURE__ */ new Set([
  "turn_stop",
  "subagent_stop"
]);
var CLAUDE_CONTEXT_EVENT_NAMES = {
  session_start: "SessionStart",
  after_tool: "PostToolUse"
};
function feedback(decision, action) {
  return `Detestify ${action} (${decision.reason_code}). Run detestify verify-change for details.`;
}
function advice(event, decision) {
  const hookEventName = CLAUDE_CONTEXT_EVENT_NAMES[event];
  if (hookEventName === void 0) {
    return {
      stdout: `${JSON.stringify({
        systemMessage: feedback(decision, "reported guidance")
      })}
`,
      stderr: null,
      exitCode: 0
    };
  }
  return {
    stdout: `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: feedback(decision, "reported guidance")
      }
    })}
`,
    stderr: null,
    exitCode: 0
  };
}
function translateClaudeDecision(event, decision) {
  if (decision.action === "allow") {
    return ALLOW;
  }
  if (decision.action === "advise") {
    return advice(event, decision);
  }
  if (decision.action === "deny_tool") {
    if (event !== "before_tool") {
      return advice(event, decision);
    }
    return {
      stdout: `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: feedback(decision, "denied this tool call")
        }
      })}
`,
      stderr: null,
      exitCode: 0
    };
  }
  if (event === "task_complete") {
    return {
      stdout: null,
      stderr: `${feedback(decision, "blocked task completion")}
`,
      exitCode: 2
    };
  }
  if (!CLAUDE_BLOCK_EVENTS.has(event)) {
    return advice(event, decision);
  }
  return {
    stdout: `${JSON.stringify({
      decision: "block",
      reason: feedback(decision, "requires verification before completion")
    })}
`,
    stderr: null,
    exitCode: 0
  };
}

// src/hooks/codex/adapter.ts
var CODEX_EVENT_MAP = {
  SessionStart: "session_start",
  PreToolUse: "before_tool",
  PostToolUse: "after_tool",
  SubagentStop: "subagent_stop",
  Stop: "turn_stop",
  SessionEnd: "session_end"
};
var CODEX_SUPPORTED_EVENTS = [
  "session_start",
  "before_tool",
  "after_tool",
  "subagent_stop",
  "turn_stop",
  "session_end"
];
function field2(raw, key) {
  return raw[key];
}
function optionalString2(raw, key) {
  const value = field2(raw, key);
  return typeof value === "string" ? value : null;
}
async function normalizeCodexInput(raw, declaredEvent, context) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Codex hook payload must be a JSON object.");
  }
  if (!CODEX_SUPPORTED_EVENTS.includes(declaredEvent)) {
    throw new Error(
      `Codex adapter does not support event: ${declaredEvent} (task_complete has no native Codex event).`
    );
  }
  const rawName = optionalString2(raw, "hook_event_name");
  if (rawName !== null) {
    const mapped = CODEX_EVENT_MAP[rawName];
    if (mapped === void 0) {
      throw new Error(`Unknown Codex hook event in payload: ${rawName}`);
    }
    if (mapped !== declaredEvent) {
      throw new Error(
        `Codex payload event ${rawName} does not match hook event ${declaredEvent}.`
      );
    }
  }
  const payloadCwd = optionalString2(raw, "cwd");
  const cwd = payloadCwd !== null && payloadCwd.startsWith("/") ? payloadCwd : context.cwd;
  const alreadyRemediated = field2(raw, "stop_hook_active") === true;
  const isToolEvent = declaredEvent === "before_tool" || declaredEvent === "after_tool";
  const toolName = isToolEvent ? optionalString2(raw, "tool_name") : null;
  const toolInput = isToolEvent ? field2(raw, "tool_input") : void 0;
  const toolResponse = isToolEvent ? field2(raw, "tool_response") : void 0;
  const inputRef = isToolEvent && toolInput !== void 0 && toolInput !== null ? await context.store(redactJson(toolInput), "codex-tool-input") : null;
  const resultRef = isToolEvent && toolResponse !== void 0 && toolResponse !== null ? await context.store(redactJson(toolResponse), "codex-tool-result") : null;
  const rawPayloadRef = await context.store(
    redactJson(raw),
    `codex-${declaredEvent}`
  );
  return buildInvocation({
    host: "codex",
    host_version: context.hostVersion,
    event: declaredEvent,
    session_id: optionalString2(raw, "session_id"),
    turn_id: optionalString2(raw, "turn_id"),
    cwd,
    repo_root: context.repoRoot,
    tool: {
      name: toolName,
      input_ref: inputRef,
      result_ref: resultRef
    },
    loop_guard: {
      already_remediated: alreadyRemediated,
      attempt: alreadyRemediated ? 1 : 0
    },
    raw_payload_ref: rawPayloadRef
  });
}
var ALLOW2 = { stdout: null, stderr: null, exitCode: 0 };
var CODEX_BLOCK_EVENTS = /* @__PURE__ */ new Set([
  "turn_stop",
  "subagent_stop"
]);
var CODEX_CONTEXT_EVENT_NAMES = {
  session_start: "SessionStart",
  after_tool: "PostToolUse"
};
function feedback2(decision, action) {
  return `Detestify ${action} (${decision.reason_code}). Run detestify verify-change for details.`;
}
function advice2(event, decision) {
  const hookEventName = CODEX_CONTEXT_EVENT_NAMES[event];
  if (hookEventName === void 0) {
    return {
      stdout: `${JSON.stringify({
        systemMessage: feedback2(decision, "reported guidance")
      })}
`,
      stderr: null,
      exitCode: 0
    };
  }
  return {
    stdout: `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: feedback2(decision, "reported guidance")
      }
    })}
`,
    stderr: null,
    exitCode: 0
  };
}
function translateCodexDecision(event, decision) {
  if (decision.action === "allow") {
    return ALLOW2;
  }
  if (decision.action === "advise") {
    return advice2(event, decision);
  }
  if (decision.action === "deny_tool") {
    if (event !== "before_tool") {
      return advice2(event, decision);
    }
    return {
      stdout: `${JSON.stringify({
        decision: "block",
        reason: feedback2(decision, "denied this tool call")
      })}
`,
      stderr: null,
      exitCode: 0
    };
  }
  if (!CODEX_BLOCK_EVENTS.has(event)) {
    return advice2(event, decision);
  }
  return {
    stdout: `${JSON.stringify({
      decision: "block",
      reason: feedback2(decision, "requires verification before completion")
    })}
`,
    stderr: null,
    exitCode: 0
  };
}

// src/analysis/runtime-equivalence.ts
import { stripTypeScriptTypes } from "node:module";
var SOURCE_FILE_SIZE_LIMIT = 8 * 1024 * 1024;
function hasEquivalentNativeRuntimeEmit(before, after) {
  const emitWarning = process.emitWarning;
  process.emitWarning = function(warning, ...args) {
    const type = typeof args[0] === "object" ? args[0]?.type : args[0];
    if (type === "ExperimentalWarning" && String(warning).includes("stripTypeScriptTypes")) {
      return;
    }
    Reflect.apply(emitWarning, process, [warning, ...args]);
  };
  try {
    const options = { mode: "transform", sourceMap: false };
    return stripTypeScriptTypes(before, options) === stripTypeScriptTypes(after, options);
  } catch {
    return false;
  } finally {
    process.emitWarning = emitWarning;
  }
}
async function runtimeEquivalentTypeScriptPaths(snapshot, equivalent, gitOptions = {}) {
  if (snapshot.baseRevision === null) return [];
  const candidates = snapshot.changedFiles.filter(
    (file) => file.status === "modified" && /\.(?:ts|tsx|mts|cts)$/.test(file.path) && !/\.d\.(?:ts|mts|cts)$/.test(file.path) && !isTestFilePath(file.path)
  );
  const result = [];
  for (const file of candidates) {
    try {
      const [{ stdout: before }, after] = await Promise.all([
        runGit(
          snapshot.root,
          ["show", `${snapshot.baseRevision}:${file.path}`],
          gitOptions
        ),
        readContainedRegularFile(
          snapshot.root,
          file.path,
          SOURCE_FILE_SIZE_LIMIT
        )
      ]);
      if (equivalent(before, after.toString("utf8"), file.path)) {
        result.push(file.path);
      }
    } catch {
    }
  }
  return result.sort();
}

// src/evidence/receipts.ts
import path8 from "node:path";

// src/evidence/runners/process.ts
var DEFAULT_MAX_OUTPUT_BYTES2 = 8 * 1024 * 1024;
function hasPassingTestResults(results) {
  return results !== null && results.success && results.total > 0 && results.passed > 0 && results.failed === 0;
}

// src/evidence/receipts.ts
var RECEIPT_MAX_BYTES = 1024 * 1024;
var FINGERPRINT = /^sha256:[0-9a-f]{64}$/;
var RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function stateDirectory(repoRoot) {
  return repositoryStateDirectory(repoRoot);
}
function receiptsDirectory(stateDir) {
  return path8.join(stateDir, "reports", "receipts");
}
function isPassingRun(selectionComplete, stale, timedOut, outputTruncated, processGroupKilled, exitCode, results) {
  return selectionComplete && !stale && !timedOut && !outputTruncated && !processGroupKilled && exitCode === 0 && hasPassingTestResults(results);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === expected.length && actual.every((key, index) => key === sortedExpected[index]);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function isNullableString(value) {
  return value === null || typeof value === "string";
}
function isInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function isNonnegativeInteger(value) {
  return isInteger(value) && value >= 0;
}
function isIsoDate(value) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}
function isFailure(value) {
  if (!isRecord(value) || !hasKeys(value, ["file", "identityDigest", "message", "name"])) {
    return false;
  }
  return typeof value.name === "string" && typeof value.message === "string" && isNullableString(value.file) && typeof value.identityDigest === "string" && /^[0-9a-f]{64}$/.test(value.identityDigest);
}
function isResults(value) {
  if (!isRecord(value) || !hasKeys(value, [
    "failed",
    "failures",
    "passed",
    "skipped",
    "success",
    "total"
  ])) {
    return false;
  }
  if (!isNonnegativeInteger(value.total) || !isNonnegativeInteger(value.passed) || !isNonnegativeInteger(value.failed) || !isNonnegativeInteger(value.skipped) || typeof value.success !== "boolean" || !Array.isArray(value.failures) || !value.failures.every(isFailure)) {
    return false;
  }
  return value.total === value.passed + value.failed + value.skipped;
}
function isReceipt(value) {
  if (!isRecord(value) || !hasKeys(value, [
    "base_revision",
    "command",
    "created_at",
    "diff_fingerprint_end",
    "diff_fingerprint_start",
    "duration_ms",
    "exit_code",
    "finished_at",
    "head_revision",
    "limitations",
    "output_truncated",
    "passed",
    "policy_fingerprint",
    "process_group_killed",
    "receipt_id",
    "repo_root",
    "results",
    "runner",
    "runner_version",
    "schema_version",
    "selection_complete",
    "selected_test_files",
    "stale",
    "started_at",
    "timed_out"
  ])) {
    return false;
  }
  if (!isRecord(value.command) || !hasKeys(value.command, ["argv", "cwd", "env_keys", "timeout_ms"])) {
    return false;
  }
  const results = value.results;
  const stale = typeof value.diff_fingerprint_start === "string" && typeof value.diff_fingerprint_end === "string" && value.diff_fingerprint_start !== value.diff_fingerprint_end;
  const passed = isPassingRun(
    value.selection_complete === true,
    stale,
    value.timed_out === true,
    value.output_truncated === true,
    value.process_group_killed === true,
    isInteger(value.exit_code) ? value.exit_code : null,
    results !== null && isResults(results) ? results : null
  );
  return value.schema_version === "1.0" && typeof value.receipt_id === "string" && RECEIPT_ID.test(value.receipt_id) && isIsoDate(value.created_at) && typeof value.repo_root === "string" && path8.isAbsolute(value.repo_root) && isNullableString(value.base_revision) && isNullableString(value.head_revision) && (value.runner === "vitest" || value.runner === "jest" || value.runner === "node:test") && isNullableString(value.runner_version) && isStringArray(value.command.argv) && value.command.argv.length > 0 && typeof value.command.cwd === "string" && path8.isAbsolute(value.command.cwd) && isStringArray(value.command.env_keys) && isInteger(value.command.timeout_ms) && value.command.timeout_ms > 0 && isIsoDate(value.started_at) && isIsoDate(value.finished_at) && isNonnegativeInteger(value.duration_ms) && (value.exit_code === null || isInteger(value.exit_code)) && typeof value.timed_out === "boolean" && typeof value.output_truncated === "boolean" && typeof value.process_group_killed === "boolean" && isStringArray(value.selected_test_files) && typeof value.selection_complete === "boolean" && (results === null || isResults(results)) && typeof value.diff_fingerprint_start === "string" && FINGERPRINT.test(value.diff_fingerprint_start) && typeof value.diff_fingerprint_end === "string" && FINGERPRINT.test(value.diff_fingerprint_end) && typeof value.policy_fingerprint === "string" && FINGERPRINT.test(value.policy_fingerprint) && value.stale === stale && value.passed === passed && isStringArray(value.limitations);
}
async function latestReceipt(stateDir) {
  const directory = receiptsDirectory(stateDir);
  try {
    const names = await readPrivateDirectory(directory, stateDir);
    if (names === null) {
      return null;
    }
    const candidates = names.filter((name) => name.endsWith(".json")).sort().reverse();
    for (const name of candidates) {
      const file = path8.join(directory, name);
      try {
        const text = await readPrivateTextFile(
          file,
          stateDir,
          RECEIPT_MAX_BYTES
        );
        if (text === null) {
          continue;
        }
        const document = JSON.parse(text);
        if (isReceipt(document) && name === `${document.created_at.replace(/[:.]/g, "")}-${document.receipt_id}.json`) {
          return { receipt: document, path: file };
        }
      } catch {
      }
    }
  } catch {
    return null;
  }
  return null;
}

// src/hooks/decider.ts
var STOP_EVENTS = /* @__PURE__ */ new Set([
  "turn_stop",
  "subagent_stop",
  "task_complete"
]);
var FILE_TARGET_TOOLS = /* @__PURE__ */ new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit"
]);
var GIT_BUDGET = { timeoutMs: 4e3 };
var NO_EXECUTION_LIMITATION = "No test was executed from the hook; run detestify verify-change for an executable receipt.";
var FAILING_RECEIPT_AXES = {
  consequence: "degraded",
  exposure: "user_facing",
  change_mechanism: "pure_behavior",
  evidence_gap: "material",
  confidence: "observed"
};
function allow(reasonCode, summary, limitations = []) {
  return buildDecision({
    action: "allow",
    confidence: "high",
    reason_code: reasonCode,
    summary,
    remediation: null,
    report_path: null,
    limitations,
    loop_guard: { next_attempt: 0 }
  });
}
async function targetIsContained(invocation, target) {
  const repoRoot = invocation.repo_root;
  return repoRoot === null ? true : isRepositoryMutationTargetContained(repoRoot, invocation.cwd, target);
}
async function decideBeforeTool(invocation, context) {
  const toolName = invocation.tool.name;
  const target = context?.toolTargetPath ?? null;
  if (toolName === null || !FILE_TARGET_TOOLS.has(toolName) || target === null || invocation.repo_root === null) {
    return allow(
      "EVENT_NOT_GATED",
      "No concrete repository path violation was identified for this tool call."
    );
  }
  if (await targetIsContained(invocation, target)) {
    return allow(
      "TOOL_TARGET_CONTAINED",
      "The tool target is contained within the repository root."
    );
  }
  return buildDecision({
    action: "deny_tool",
    confidence: "high",
    reason_code: "TOOL_TARGET_OUTSIDE_REPOSITORY",
    summary: "The tool target resolves outside the repository root.",
    remediation: null,
    report_path: null,
    limitations: [],
    loop_guard: { next_attempt: 0 }
  });
}
async function decideStop(invocation) {
  const repoRoot = invocation.repo_root;
  if (repoRoot === null) {
    return allow(
      "NO_REPOSITORY",
      "No Git repository is associated with this session; nothing to verify."
    );
  }
  const trust = await loadTrust(repoRoot);
  const snapshot = stripOwnState(
    await snapshotRepository(repoRoot, void 0, GIT_BUDGET)
  );
  if (snapshot.changedFiles.length === 0) {
    return allow("NO_CHANGES", "The diff contains no changed paths.");
  }
  const fingerprint = (await fingerprintDiff(snapshot)).fingerprint;
  const stateDir = stateDirectory(repoRoot);
  const found = await latestReceipt(stateDir);
  if (found !== null && found.receipt.diff_fingerprint_end === fingerprint && found.receipt.policy_fingerprint === trust.policyFingerprint && !found.receipt.stale) {
    if (found.receipt.passed) {
      return buildDecision({
        action: "allow",
        confidence: "high",
        reason_code: "VERIFIED_WITH_RECEIPT",
        summary: "A passing verification receipt matches the current diff fingerprint.",
        remediation: null,
        report_path: found.path,
        limitations: [],
        loop_guard: { next_attempt: 0 }
      });
    }
    const failed = found.receipt.results?.failed ?? null;
    const action = allowedGateAction({
      tier: assignTier({
        axes: FAILING_RECEIPT_AXES,
        distinctChangedObligation: true
      }),
      provenance: "observed",
      mode: trust.mode,
      gateEligible: isGateEligible({
        provenance: "observed",
        executableGapDemonstrated: true,
        ruleId: "TST-003",
        elevatedRuleIds: trust.elevatedRuleIds
      })
    });
    return buildDecision({
      action: action === "request_remediation" ? "request_remediation" : "advise",
      confidence: "high",
      reason_code: "VERIFICATION_FAILED",
      summary: `The verification receipt for the current diff records ${failed ?? "unparsed"} failing focused test${failed === 1 ? "" : "s"}.`,
      remediation: action === "request_remediation" ? "Fix the failing focused tests recorded in the verification receipt, then re-run detestify verify-change to produce a passing receipt." : null,
      report_path: found.path,
      limitations: [],
      loop_guard: { next_attempt: action === "request_remediation" ? 1 : 0 }
    });
  }
  const changedTestFiles = snapshot.changedFiles.filter((file) => file.status !== "deleted" && isTestFilePath(file.path)).map((file) => file.path).sort();
  const plan = evaluatePlanStage({
    snapshot,
    trust,
    observedAt: (/* @__PURE__ */ new Date()).toISOString(),
    changedTestFiles,
    runtimeEquivalentPaths: await runtimeEquivalentTypeScriptPaths(
      snapshot,
      hasEquivalentNativeRuntimeEmit,
      GIT_BUDGET
    ),
    idPrefix: "hook-plan"
  });
  const strongest = plan.strongestDecision;
  if (strongest?.outcome === "EXISTING_EVIDENCE_SUFFICIENT") {
    return allow("EXISTING_EVIDENCE_SUFFICIENT", strongest.summary, [
      NO_EXECUTION_LIMITATION,
      ...strongest.limitations
    ]);
  }
  if (strongest?.outcome === "NO_TEST_SUPPORTED") {
    return allow(strongest.reason_code, strongest.summary, [
      NO_EXECUTION_LIMITATION,
      ...strongest.limitations
    ]);
  }
  if (strongest === null || plan.strongestAction === "allow") {
    return allow(
      "NO_MATERIAL_OBLIGATION",
      "The current diff exposes no obligation requiring new evidence.",
      [NO_EXECUTION_LIMITATION]
    );
  }
  if (plan.strongestAction === "request_remediation") {
    return buildDecision({
      action: "request_remediation",
      confidence: strongest.confidence,
      reason_code: strongest.reason_code,
      summary: strongest.summary,
      remediation: `${strongest.remediation ?? "Add the required evidence for the changed obligation."} Then run detestify verify-change to record a passing receipt.`,
      report_path: null,
      limitations: [NO_EXECUTION_LIMITATION, ...strongest.limitations],
      loop_guard: { next_attempt: 1 }
    });
  }
  return buildDecision({
    action: "advise",
    confidence: strongest.confidence,
    reason_code: strongest.reason_code,
    summary: strongest.summary,
    remediation: null,
    report_path: null,
    limitations: [NO_EXECUTION_LIMITATION, ...strongest.limitations],
    loop_guard: { next_attempt: 0 }
  });
}
var coreHookDecider = async (invocation, context) => {
  try {
    if (invocation.event === "before_tool") {
      return await decideBeforeTool(invocation, context);
    }
    if (!STOP_EVENTS.has(invocation.event)) {
      return allow(
        "EVENT_NOT_GATED",
        "This lifecycle event is not gated by Detestify."
      );
    }
    return await decideStop(invocation);
  } catch (error) {
    return allow(
      "CORE_UNAVAILABLE",
      "Detestify could not evaluate this repository; no verification claim is made.",
      [
        `Fast-path evaluation failed: ${error instanceof Error ? error.message : String(error)}`
      ]
    );
  }
};

// src/hooks/entry.ts
var BLOCK_GUARD_EVENTS = /* @__PURE__ */ new Set([
  "turn_stop",
  "subagent_stop",
  "task_complete"
]);
var GIT_BUDGET2 = { timeoutMs: 4e3 };
var RAW_PAYLOAD_BYTE_LIMIT = 1024 * 1024;
var APPLY_PATCH_PAYLOAD_BYTE_LIMIT = 8 * RAW_PAYLOAD_BYTE_LIMIT;
var TOOL_TARGET_BYTE_LIMIT = 4096;
var FILE_TARGET_TOOLS2 = /* @__PURE__ */ new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit"
]);
var FILE_MUTATION_TOOLS = /* @__PURE__ */ new Set([
  ...FILE_TARGET_TOOLS2,
  "apply_patch"
]);
var APPLY_PATCH_PATH_MARKERS = [
  "*** Add File: ",
  "*** Delete File: ",
  "*** Update File: ",
  "*** Move to: "
];
async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
async function findGitRoot(start) {
  let current = path9.resolve(start);
  while (true) {
    if (await pathExists(path9.join(current, ".git"))) {
      return current;
    }
    const parent = path9.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
function hookPayloadByteLimit(argv) {
  return argv[1] === "before_tool" ? APPLY_PATCH_PAYLOAD_BYTE_LIMIT : RAW_PAYLOAD_BYTE_LIMIT;
}
async function readBoundedHookInput(input, byteLimit) {
  if (!Number.isSafeInteger(byteLimit) || byteLimit < 1) {
    throw new RangeError("Hook input byte limit must be a positive integer.");
  }
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of input) {
      const bytes = Buffer2.from(chunk);
      const remaining = byteLimit - total;
      if (bytes.length > remaining) {
        if (remaining > 0) {
          chunks.push(bytes.subarray(0, remaining));
          total += remaining;
        }
        return {
          stdin: Buffer2.concat(chunks, total).toString("utf8"),
          exceeded: true
        };
      }
      chunks.push(bytes);
      total += bytes.length;
    }
  } catch {
    return { stdin: "", exceeded: false };
  }
  return {
    stdin: Buffer2.concat(chunks, total).toString("utf8"),
    exceeded: false
  };
}
function jsonStringEnd(source, start) {
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return index;
    }
  }
  return null;
}
function topLevelStringField(source, field3) {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      const end = jsonStringEnd(source, index);
      if (end === null) {
        return null;
      }
      if (depth === 1) {
        let cursor = end + 1;
        while (/\s/u.test(source[cursor] ?? "")) {
          cursor += 1;
        }
        const key = source.slice(index + 1, end);
        if (source[cursor] === ":" && key === field3) {
          cursor += 1;
          while (/\s/u.test(source[cursor] ?? "")) {
            cursor += 1;
          }
          if (source[cursor] !== '"') {
            return null;
          }
          const valueEnd = jsonStringEnd(source, cursor);
          if (valueEnd === null) {
            return null;
          }
          const value = source.slice(cursor + 1, valueEnd);
          return value.includes("\\") ? null : value;
        }
      }
      index = end;
    } else if (character === "{" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
  return null;
}
function bounded(value) {
  return value === null ? null : value.slice(0, 128);
}
function eventIdentity(raw, event) {
  if (event !== "subagent_stop" && event !== "task_complete" || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const field3 = event === "task_complete" ? "task_id" : "agent_id";
  const value = raw[field3];
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return `${event === "task_complete" ? "task" : "subagent"}:${value.normalize("NFC").trim()}`;
}
function toolTargetPath(raw, invocation) {
  if (invocation.event !== "before_tool" || invocation.tool.name === null || !FILE_TARGET_TOOLS2.has(invocation.tool.name) || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const input = raw["tool_input"];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const field3 = invocation.tool.name === "NotebookEdit" ? "notebook_path" : "file_path";
  const target = input[field3];
  return typeof target === "string" && target.trim() !== "" && !target.includes("\0") && Buffer2.byteLength(target, "utf8") <= TOOL_TARGET_BYTE_LIMIT ? target : null;
}
function applyPatchTargetPaths(raw, invocation) {
  if (invocation.event !== "before_tool" || invocation.tool.name !== "apply_patch") {
    return void 0;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const input = raw["tool_input"];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const command = input["command"];
  if (typeof command !== "string") {
    return null;
  }
  const lines = command.trim().split(/\r?\n/u);
  if (lines[0]?.trim() !== "*** Begin Patch" || lines.at(-1)?.trim() !== "*** End Patch") {
    return null;
  }
  const targets = [];
  for (const line of lines.slice(1, -1)) {
    const trimmed = line.trim();
    const marker = APPLY_PATCH_PATH_MARKERS.find(
      (candidate) => trimmed.startsWith(candidate)
    );
    if (marker === void 0) {
      continue;
    }
    const target = trimmed.slice(marker.length);
    if (target === "" || target.includes("\0") || Buffer2.byteLength(target, "utf8") > TOOL_TARGET_BYTE_LIMIT) {
      return null;
    }
    targets.push(target);
  }
  return targets;
}
async function toolTargetIsContained(invocation, target) {
  return invocation.repo_root === null ? false : isRepositoryMutationTargetContained(
    invocation.repo_root,
    invocation.cwd,
    target
  );
}
async function denyToolDecision(reasonCode, summary) {
  return parseDecision({
    schema_version: "1.0",
    action: "deny_tool",
    confidence: "high",
    reason_code: reasonCode,
    summary,
    remediation: null,
    report_path: null,
    limitations: [],
    loop_guard: { next_attempt: 0, max_attempts: 2 }
  });
}
async function mutationGuardDecision(raw, invocation, targetPath) {
  if (invocation.event !== "before_tool") {
    return null;
  }
  if (invocation.tool.name !== null && FILE_TARGET_TOOLS2.has(invocation.tool.name)) {
    if (targetPath === null) {
      return denyToolDecision(
        "TOOL_TARGET_UNAVAILABLE",
        `The ${invocation.tool.name} target path could not be established.`
      );
    }
    if (!await toolTargetIsContained(invocation, targetPath)) {
      return denyToolDecision(
        "TOOL_TARGET_OUTSIDE_REPOSITORY",
        `The ${invocation.tool.name} target resolves outside the repository root.`
      );
    }
    return null;
  }
  const targets = applyPatchTargetPaths(raw, invocation);
  if (targets === void 0) {
    return null;
  }
  const unavailable = targets === null || targets.length === 0;
  const outside = !unavailable && !(await Promise.all(
    targets.map((target) => toolTargetIsContained(invocation, target))
  )).every(Boolean);
  if (!unavailable && !outside) {
    return null;
  }
  return denyToolDecision(
    unavailable ? "APPLY_PATCH_TARGETS_UNAVAILABLE" : "TOOL_TARGET_OUTSIDE_REPOSITORY",
    unavailable ? "The apply_patch target paths could not be established." : "An apply_patch target resolves outside the repository root."
  );
}
async function currentDiffFingerprint(repoRoot) {
  if (repoRoot === null) {
    return null;
  }
  try {
    const snapshot = stripOwnState(
      await snapshotRepository(repoRoot, void 0, GIT_BUDGET2)
    );
    return (await fingerprintDiff(snapshot)).fingerprint;
  } catch {
    return null;
  }
}
async function recordInvocation(invocation, stateDir, now, diffFingerprint2, decision, oneShotDowngraded) {
  if (stateDir === null) {
    return;
  }
  const recordedAt = new Date(now).toISOString();
  const file = path9.join(
    stateDir,
    "hooks",
    "invocations",
    `${recordedAt.replace(/[:.]/g, "")}-${randomUUID2()}.json`
  );
  try {
    await writePrivateJsonAtomic(
      file,
      {
        schema_version: "1.0",
        recorded_at: recordedAt,
        host: invocation.host,
        host_version: bounded(invocation.host_version),
        event: invocation.event,
        session_id: bounded(invocation.session_id),
        turn_id: bounded(invocation.turn_id),
        tool_name: bounded(invocation.tool.name),
        diff_fingerprint: diffFingerprint2,
        loop_guard: invocation.loop_guard,
        action: decision.action,
        reason_code: decision.reason_code.slice(0, 128),
        one_shot_downgraded: oneShotDowngraded
      },
      stateDir
    );
  } catch {
  }
}
async function applyOneShotGuard(invocation, decision, options, repoRoot, identity) {
  if (decision.action !== "request_remediation" || !BLOCK_GUARD_EVENTS.has(invocation.event)) {
    return decision;
  }
  const key = loopKey(invocation, identity);
  const status = await inspectLoopState(key, {
    alreadyRemediated: invocation.loop_guard.already_remediated,
    repoRoot,
    stateDir: options.stateDir,
    now: options.now?.()
  });
  if (status.alreadyRemediated) {
    return parseDecision({
      ...decision,
      action: "advise",
      remediation: null,
      limitations: [
        ...decision.limitations,
        "One remediation continuation was already granted; remaining gap disclosed without blocking.",
        ...status.limitations
      ]
    });
  }
  const granted = await recordRemediation(key, {
    alreadyRemediated: invocation.loop_guard.already_remediated,
    repoRoot,
    stateDir: options.stateDir,
    now: options.now?.()
  });
  if (!granted) {
    return parseDecision({
      ...decision,
      action: "advise",
      remediation: null,
      limitations: [
        ...decision.limitations,
        "Loop state could not be persisted; remediation request downgraded to advice."
      ]
    });
  }
  return decision;
}
async function runBoundedHook(argv, stdin, inputLimitExceeded, options) {
  const [host, event] = argv;
  if (host !== "claude" && host !== "codex") {
    return {
      stdout: null,
      stderr: "detestify-hook: expected <claude|codex> <event>\n",
      exitCode: 2
    };
  }
  const toolName = event === "before_tool" ? topLevelStringField(stdin, "tool_name") : null;
  const payloadLimit = event === "before_tool" && toolName === "apply_patch" ? APPLY_PATCH_PAYLOAD_BYTE_LIMIT : RAW_PAYLOAD_BYTE_LIMIT;
  const oversized = inputLimitExceeded || Buffer2.byteLength(stdin, "utf8") > payloadLimit;
  if (oversized) {
    if (toolName !== null && FILE_MUTATION_TOOLS.has(toolName)) {
      const denied = await denyToolDecision(
        "HOOK_PAYLOAD_TOO_LARGE",
        "The file mutation payload exceeded the safe hook input limit, so its target could not be established."
      );
      return host === "claude" ? translateClaudeDecision("before_tool", denied) : translateCodexDecision("before_tool", denied);
    }
    return { stdout: null, stderr: null, exitCode: 0 };
  }
  let raw;
  try {
    raw = JSON.parse(stdin);
  } catch {
    if (toolName !== null && FILE_MUTATION_TOOLS.has(toolName)) {
      const denied = await denyToolDecision(
        toolName === "apply_patch" ? "APPLY_PATCH_TARGETS_UNAVAILABLE" : "TOOL_TARGET_UNAVAILABLE",
        `The ${toolName} target path could not be established.`
      );
      return host === "claude" ? translateClaudeDecision("before_tool", denied) : translateCodexDecision("before_tool", denied);
    }
    return { stdout: null, stderr: null, exitCode: 0 };
  }
  try {
    if (options.stateDir !== void 0 && !path9.isAbsolute(options.stateDir)) {
      throw new Error("Hook state directory override must be absolute.");
    }
    const payloadCwd = typeof raw === "object" && raw !== null && "cwd" in raw && typeof raw.cwd === "string" ? raw.cwd : process.cwd();
    const repoRoot = options.repoRoot !== void 0 ? options.repoRoot : await findGitRoot(payloadCwd);
    const stateDir = options.stateDir ?? (repoRoot === null ? null : repositoryStateDirectory(repoRoot));
    const context = {
      hostVersion: options.hostVersion ?? null,
      repoRoot,
      cwd: process.cwd(),
      // Hook payloads may contain secrets and repository-controlled text.
      // Raw payload persistence stays disabled by default.
      store: async () => null
    };
    const invocation = host === "claude" ? await normalizeClaudeInput(raw, event, context) : await normalizeCodexInput(raw, event, context);
    const targetPath = toolTargetPath(raw, invocation);
    const mutationGuard = await mutationGuardDecision(
      raw,
      invocation,
      targetPath
    );
    const runtimeContext = {
      toolTargetPath: targetPath
    };
    const identity = eventIdentity(raw, invocation.event);
    raw = null;
    const diffFingerprint2 = invocation.event === "after_tool" ? await currentDiffFingerprint(repoRoot) : null;
    const decide = options.decide ?? coreHookDecider;
    const requested = mutationGuard ?? await decide(invocation, runtimeContext);
    const guarded = await applyOneShotGuard(
      invocation,
      requested,
      options,
      repoRoot,
      identity
    );
    await recordInvocation(
      invocation,
      stateDir,
      options.now?.() ?? Date.now(),
      diffFingerprint2,
      guarded,
      requested.action === "request_remediation" && guarded.action !== "request_remediation"
    );
    if (invocation.event === "session_end") {
      await clearSessionState(invocation.host, invocation.session_id, {
        repoRoot,
        stateDir: options.stateDir
      });
    }
    const output = host === "claude" ? translateClaudeDecision(invocation.event, guarded) : translateCodexDecision(invocation.event, guarded);
    return output;
  } catch {
    return { stdout: null, stderr: null, exitCode: 0 };
  }
}
async function runHook(argv, stdin, options = {}) {
  return runBoundedHook(
    argv,
    stdin,
    Buffer2.byteLength(stdin, "utf8") > hookPayloadByteLimit(argv),
    options
  );
}
async function hookMain() {
  const argv = process.argv.slice(2);
  const input = await readBoundedHookInput(
    process.stdin,
    hookPayloadByteLimit(argv)
  );
  const result = await runBoundedHook(argv, input.stdin, input.exceeded, {});
  if (result.stdout !== null) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== null) {
    process.stderr.write(result.stderr);
  }
  return result.exitCode;
}
var invokedPath = process.argv[1] === void 0 ? null : path9.resolve(process.argv[1]);
if (invokedPath === fileURLToPath2(import.meta.url)) {
  process.exitCode = await hookMain();
}
export {
  readBoundedHookInput,
  runHook
};
