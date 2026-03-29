"use strict";
(() => {
  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var r;
  var o;
  var e;
  var f;
  var c;
  var s;
  var a;
  var h;
  var p = {};
  var v = [];
  var y = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var d = Array.isArray;
  function w(n3, l5) {
    for (var u5 in l5) n3[u5] = l5[u5];
    return n3;
  }
  function g(n3) {
    n3 && n3.parentNode && n3.parentNode.removeChild(n3);
  }
  function m(n3, t4, i5, r4, o4) {
    var e4 = { type: n3, props: t4, key: i5, ref: r4, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o4 ? ++u : o4, __i: -1, __u: 0 };
    return null == o4 && null != l.vnode && l.vnode(e4), e4;
  }
  function k(n3) {
    return n3.children;
  }
  function x(n3, l5) {
    this.props = n3, this.context = l5;
  }
  function S(n3, l5) {
    if (null == l5) return n3.__ ? S(n3.__, n3.__i + 1) : null;
    for (var u5; l5 < n3.__k.length; l5++) if (null != (u5 = n3.__k[l5]) && null != u5.__e) return u5.__e;
    return "function" == typeof n3.type ? S(n3) : null;
  }
  function C(n3) {
    if (n3.__P && n3.__d) {
      var u5 = n3.__v, t4 = u5.__e, i5 = [], r4 = [], o4 = w({}, u5);
      o4.__v = u5.__v + 1, l.vnode && l.vnode(o4), z(n3.__P, o4, u5, n3.__n, n3.__P.namespaceURI, 32 & u5.__u ? [t4] : null, i5, null == t4 ? S(u5) : t4, !!(32 & u5.__u), r4), o4.__v = u5.__v, o4.__.__k[o4.__i] = o4, V(i5, o4, r4), u5.__e = u5.__ = null, o4.__e != t4 && M(o4);
    }
  }
  function M(n3) {
    if (null != (n3 = n3.__) && null != n3.__c) return n3.__e = n3.__c.base = null, n3.__k.some(function(l5) {
      if (null != l5 && null != l5.__e) return n3.__e = n3.__c.base = l5.__e;
    }), M(n3);
  }
  function $(n3) {
    (!n3.__d && (n3.__d = true) && i.push(n3) && !I.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(I);
  }
  function I() {
    try {
      for (var n3, l5 = 1; i.length; ) i.length > l5 && i.sort(e), n3 = i.shift(), l5 = i.length, C(n3);
    } finally {
      i.length = I.__r = 0;
    }
  }
  function P(n3, l5, u5, t4, i5, r4, o4, e4, f5, c4, s4) {
    var a4, h5, y5, d5, w5, g4, _4, m4 = t4 && t4.__k || v, b3 = l5.length;
    for (f5 = A(u5, l5, m4, f5, b3), a4 = 0; a4 < b3; a4++) null != (y5 = u5.__k[a4]) && (h5 = -1 != y5.__i && m4[y5.__i] || p, y5.__i = a4, g4 = z(n3, y5, h5, i5, r4, o4, e4, f5, c4, s4), d5 = y5.__e, y5.ref && h5.ref != y5.ref && (h5.ref && D(h5.ref, null, y5), s4.push(y5.ref, y5.__c || d5, y5)), null == w5 && null != d5 && (w5 = d5), (_4 = !!(4 & y5.__u)) || h5.__k === y5.__k ? f5 = H(y5, f5, n3, _4) : "function" == typeof y5.type && void 0 !== g4 ? f5 = g4 : d5 && (f5 = d5.nextSibling), y5.__u &= -7);
    return u5.__e = w5, f5;
  }
  function A(n3, l5, u5, t4, i5) {
    var r4, o4, e4, f5, c4, s4 = u5.length, a4 = s4, h5 = 0;
    for (n3.__k = new Array(i5), r4 = 0; r4 < i5; r4++) null != (o4 = l5[r4]) && "boolean" != typeof o4 && "function" != typeof o4 ? ("string" == typeof o4 || "number" == typeof o4 || "bigint" == typeof o4 || o4.constructor == String ? o4 = n3.__k[r4] = m(null, o4, null, null, null) : d(o4) ? o4 = n3.__k[r4] = m(k, { children: o4 }, null, null, null) : void 0 === o4.constructor && o4.__b > 0 ? o4 = n3.__k[r4] = m(o4.type, o4.props, o4.key, o4.ref ? o4.ref : null, o4.__v) : n3.__k[r4] = o4, f5 = r4 + h5, o4.__ = n3, o4.__b = n3.__b + 1, e4 = null, -1 != (c4 = o4.__i = T(o4, u5, f5, a4)) && (a4--, (e4 = u5[c4]) && (e4.__u |= 2)), null == e4 || null == e4.__v ? (-1 == c4 && (i5 > s4 ? h5-- : i5 < s4 && h5++), "function" != typeof o4.type && (o4.__u |= 4)) : c4 != f5 && (c4 == f5 - 1 ? h5-- : c4 == f5 + 1 ? h5++ : (c4 > f5 ? h5-- : h5++, o4.__u |= 4))) : n3.__k[r4] = null;
    if (a4) for (r4 = 0; r4 < s4; r4++) null != (e4 = u5[r4]) && 0 == (2 & e4.__u) && (e4.__e == t4 && (t4 = S(e4)), E(e4, e4));
    return t4;
  }
  function H(n3, l5, u5, t4) {
    var i5, r4;
    if ("function" == typeof n3.type) {
      for (i5 = n3.__k, r4 = 0; i5 && r4 < i5.length; r4++) i5[r4] && (i5[r4].__ = n3, l5 = H(i5[r4], l5, u5, t4));
      return l5;
    }
    n3.__e != l5 && (t4 && (l5 && n3.type && !l5.parentNode && (l5 = S(n3)), u5.insertBefore(n3.__e, l5 || null)), l5 = n3.__e);
    do {
      l5 = l5 && l5.nextSibling;
    } while (null != l5 && 8 == l5.nodeType);
    return l5;
  }
  function T(n3, l5, u5, t4) {
    var i5, r4, o4, e4 = n3.key, f5 = n3.type, c4 = l5[u5], s4 = null != c4 && 0 == (2 & c4.__u);
    if (null === c4 && null == e4 || s4 && e4 == c4.key && f5 == c4.type) return u5;
    if (t4 > (s4 ? 1 : 0)) {
      for (i5 = u5 - 1, r4 = u5 + 1; i5 >= 0 || r4 < l5.length; ) if (null != (c4 = l5[o4 = i5 >= 0 ? i5-- : r4++]) && 0 == (2 & c4.__u) && e4 == c4.key && f5 == c4.type) return o4;
    }
    return -1;
  }
  function j(n3, l5, u5) {
    "-" == l5[0] ? n3.setProperty(l5, null == u5 ? "" : u5) : n3[l5] = null == u5 ? "" : "number" != typeof u5 || y.test(l5) ? u5 : u5 + "px";
  }
  function F(n3, l5, u5, t4, i5) {
    var r4, o4;
    n: if ("style" == l5) if ("string" == typeof u5) n3.style.cssText = u5;
    else {
      if ("string" == typeof t4 && (n3.style.cssText = t4 = ""), t4) for (l5 in t4) u5 && l5 in u5 || j(n3.style, l5, "");
      if (u5) for (l5 in u5) t4 && u5[l5] == t4[l5] || j(n3.style, l5, u5[l5]);
    }
    else if ("o" == l5[0] && "n" == l5[1]) r4 = l5 != (l5 = l5.replace(f, "$1")), o4 = l5.toLowerCase(), l5 = o4 in n3 || "onFocusOut" == l5 || "onFocusIn" == l5 ? o4.slice(2) : l5.slice(2), n3.l || (n3.l = {}), n3.l[l5 + r4] = u5, u5 ? t4 ? u5.u = t4.u : (u5.u = c, n3.addEventListener(l5, r4 ? a : s, r4)) : n3.removeEventListener(l5, r4 ? a : s, r4);
    else {
      if ("http://www.w3.org/2000/svg" == i5) l5 = l5.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l5 && "height" != l5 && "href" != l5 && "list" != l5 && "form" != l5 && "tabIndex" != l5 && "download" != l5 && "rowSpan" != l5 && "colSpan" != l5 && "role" != l5 && "popover" != l5 && l5 in n3) try {
        n3[l5] = null == u5 ? "" : u5;
        break n;
      } catch (n4) {
      }
      "function" == typeof u5 || (null == u5 || false === u5 && "-" != l5[4] ? n3.removeAttribute(l5) : n3.setAttribute(l5, "popover" == l5 && 1 == u5 ? "" : u5));
    }
  }
  function O(n3) {
    return function(u5) {
      if (this.l) {
        var t4 = this.l[u5.type + n3];
        if (null == u5.t) u5.t = c++;
        else if (u5.t < t4.u) return;
        return t4(l.event ? l.event(u5) : u5);
      }
    };
  }
  function z(n3, u5, t4, i5, r4, o4, e4, f5, c4, s4) {
    var a4, h5, p5, y5, _4, m4, b3, S3, C4, M2, $2, I2, A3, H2, L, T3 = u5.type;
    if (void 0 !== u5.constructor) return null;
    128 & t4.__u && (c4 = !!(32 & t4.__u), o4 = [f5 = u5.__e = t4.__e]), (a4 = l.__b) && a4(u5);
    n: if ("function" == typeof T3) try {
      if (S3 = u5.props, C4 = T3.prototype && T3.prototype.render, M2 = (a4 = T3.contextType) && i5[a4.__c], $2 = a4 ? M2 ? M2.props.value : a4.__ : i5, t4.__c ? b3 = (h5 = u5.__c = t4.__c).__ = h5.__E : (C4 ? u5.__c = h5 = new T3(S3, $2) : (u5.__c = h5 = new x(S3, $2), h5.constructor = T3, h5.render = G), M2 && M2.sub(h5), h5.state || (h5.state = {}), h5.__n = i5, p5 = h5.__d = true, h5.__h = [], h5._sb = []), C4 && null == h5.__s && (h5.__s = h5.state), C4 && null != T3.getDerivedStateFromProps && (h5.__s == h5.state && (h5.__s = w({}, h5.__s)), w(h5.__s, T3.getDerivedStateFromProps(S3, h5.__s))), y5 = h5.props, _4 = h5.state, h5.__v = u5, p5) C4 && null == T3.getDerivedStateFromProps && null != h5.componentWillMount && h5.componentWillMount(), C4 && null != h5.componentDidMount && h5.__h.push(h5.componentDidMount);
      else {
        if (C4 && null == T3.getDerivedStateFromProps && S3 !== y5 && null != h5.componentWillReceiveProps && h5.componentWillReceiveProps(S3, $2), u5.__v == t4.__v || !h5.__e && null != h5.shouldComponentUpdate && false === h5.shouldComponentUpdate(S3, h5.__s, $2)) {
          u5.__v != t4.__v && (h5.props = S3, h5.state = h5.__s, h5.__d = false), u5.__e = t4.__e, u5.__k = t4.__k, u5.__k.some(function(n4) {
            n4 && (n4.__ = u5);
          }), v.push.apply(h5.__h, h5._sb), h5._sb = [], h5.__h.length && e4.push(h5);
          break n;
        }
        null != h5.componentWillUpdate && h5.componentWillUpdate(S3, h5.__s, $2), C4 && null != h5.componentDidUpdate && h5.__h.push(function() {
          h5.componentDidUpdate(y5, _4, m4);
        });
      }
      if (h5.context = $2, h5.props = S3, h5.__P = n3, h5.__e = false, I2 = l.__r, A3 = 0, C4) h5.state = h5.__s, h5.__d = false, I2 && I2(u5), a4 = h5.render(h5.props, h5.state, h5.context), v.push.apply(h5.__h, h5._sb), h5._sb = [];
      else do {
        h5.__d = false, I2 && I2(u5), a4 = h5.render(h5.props, h5.state, h5.context), h5.state = h5.__s;
      } while (h5.__d && ++A3 < 25);
      h5.state = h5.__s, null != h5.getChildContext && (i5 = w(w({}, i5), h5.getChildContext())), C4 && !p5 && null != h5.getSnapshotBeforeUpdate && (m4 = h5.getSnapshotBeforeUpdate(y5, _4)), H2 = null != a4 && a4.type === k && null == a4.key ? q(a4.props.children) : a4, f5 = P(n3, d(H2) ? H2 : [H2], u5, t4, i5, r4, o4, e4, f5, c4, s4), h5.base = u5.__e, u5.__u &= -161, h5.__h.length && e4.push(h5), b3 && (h5.__E = h5.__ = null);
    } catch (n4) {
      if (u5.__v = null, c4 || null != o4) if (n4.then) {
        for (u5.__u |= c4 ? 160 : 128; f5 && 8 == f5.nodeType && f5.nextSibling; ) f5 = f5.nextSibling;
        o4[o4.indexOf(f5)] = null, u5.__e = f5;
      } else {
        for (L = o4.length; L--; ) g(o4[L]);
        N(u5);
      }
      else u5.__e = t4.__e, u5.__k = t4.__k, n4.then || N(u5);
      l.__e(n4, u5, t4);
    }
    else null == o4 && u5.__v == t4.__v ? (u5.__k = t4.__k, u5.__e = t4.__e) : f5 = u5.__e = B(t4.__e, u5, t4, i5, r4, o4, e4, c4, s4);
    return (a4 = l.diffed) && a4(u5), 128 & u5.__u ? void 0 : f5;
  }
  function N(n3) {
    n3 && (n3.__c && (n3.__c.__e = true), n3.__k && n3.__k.some(N));
  }
  function V(n3, u5, t4) {
    for (var i5 = 0; i5 < t4.length; i5++) D(t4[i5], t4[++i5], t4[++i5]);
    l.__c && l.__c(u5, n3), n3.some(function(u6) {
      try {
        n3 = u6.__h, u6.__h = [], n3.some(function(n4) {
          n4.call(u6);
        });
      } catch (n4) {
        l.__e(n4, u6.__v);
      }
    });
  }
  function q(n3) {
    return "object" != typeof n3 || null == n3 || n3.__b > 0 ? n3 : d(n3) ? n3.map(q) : w({}, n3);
  }
  function B(u5, t4, i5, r4, o4, e4, f5, c4, s4) {
    var a4, h5, v4, y5, w5, _4, m4, b3 = i5.props || p, k4 = t4.props, x4 = t4.type;
    if ("svg" == x4 ? o4 = "http://www.w3.org/2000/svg" : "math" == x4 ? o4 = "http://www.w3.org/1998/Math/MathML" : o4 || (o4 = "http://www.w3.org/1999/xhtml"), null != e4) {
      for (a4 = 0; a4 < e4.length; a4++) if ((w5 = e4[a4]) && "setAttribute" in w5 == !!x4 && (x4 ? w5.localName == x4 : 3 == w5.nodeType)) {
        u5 = w5, e4[a4] = null;
        break;
      }
    }
    if (null == u5) {
      if (null == x4) return document.createTextNode(k4);
      u5 = document.createElementNS(o4, x4, k4.is && k4), c4 && (l.__m && l.__m(t4, e4), c4 = false), e4 = null;
    }
    if (null == x4) b3 === k4 || c4 && u5.data == k4 || (u5.data = k4);
    else {
      if (e4 = e4 && n.call(u5.childNodes), !c4 && null != e4) for (b3 = {}, a4 = 0; a4 < u5.attributes.length; a4++) b3[(w5 = u5.attributes[a4]).name] = w5.value;
      for (a4 in b3) w5 = b3[a4], "dangerouslySetInnerHTML" == a4 ? v4 = w5 : "children" == a4 || a4 in k4 || "value" == a4 && "defaultValue" in k4 || "checked" == a4 && "defaultChecked" in k4 || F(u5, a4, null, w5, o4);
      for (a4 in k4) w5 = k4[a4], "children" == a4 ? y5 = w5 : "dangerouslySetInnerHTML" == a4 ? h5 = w5 : "value" == a4 ? _4 = w5 : "checked" == a4 ? m4 = w5 : c4 && "function" != typeof w5 || b3[a4] === w5 || F(u5, a4, w5, b3[a4], o4);
      if (h5) c4 || v4 && (h5.__html == v4.__html || h5.__html == u5.innerHTML) || (u5.innerHTML = h5.__html), t4.__k = [];
      else if (v4 && (u5.innerHTML = ""), P("template" == t4.type ? u5.content : u5, d(y5) ? y5 : [y5], t4, i5, r4, "foreignObject" == x4 ? "http://www.w3.org/1999/xhtml" : o4, e4, f5, e4 ? e4[0] : i5.__k && S(i5, 0), c4, s4), null != e4) for (a4 = e4.length; a4--; ) g(e4[a4]);
      c4 || (a4 = "value", "progress" == x4 && null == _4 ? u5.removeAttribute("value") : null != _4 && (_4 !== u5[a4] || "progress" == x4 && !_4 || "option" == x4 && _4 != b3[a4]) && F(u5, a4, _4, b3[a4], o4), a4 = "checked", null != m4 && m4 != u5[a4] && F(u5, a4, m4, b3[a4], o4));
    }
    return u5;
  }
  function D(n3, u5, t4) {
    try {
      if ("function" == typeof n3) {
        var i5 = "function" == typeof n3.__u;
        i5 && n3.__u(), i5 && null == u5 || (n3.__u = n3(u5));
      } else n3.current = u5;
    } catch (n4) {
      l.__e(n4, t4);
    }
  }
  function E(n3, u5, t4) {
    var i5, r4;
    if (l.unmount && l.unmount(n3), (i5 = n3.ref) && (i5.current && i5.current != n3.__e || D(i5, null, u5)), null != (i5 = n3.__c)) {
      if (i5.componentWillUnmount) try {
        i5.componentWillUnmount();
      } catch (n4) {
        l.__e(n4, u5);
      }
      i5.base = i5.__P = null;
    }
    if (i5 = n3.__k) for (r4 = 0; r4 < i5.length; r4++) i5[r4] && E(i5[r4], u5, t4 || "function" != typeof n3.type);
    t4 || g(n3.__e), n3.__c = n3.__ = n3.__e = void 0;
  }
  function G(n3, l5, u5) {
    return this.constructor(n3, u5);
  }
  n = v.slice, l = { __e: function(n3, l5, u5, t4) {
    for (var i5, r4, o4; l5 = l5.__; ) if ((i5 = l5.__c) && !i5.__) try {
      if ((r4 = i5.constructor) && null != r4.getDerivedStateFromError && (i5.setState(r4.getDerivedStateFromError(n3)), o4 = i5.__d), null != i5.componentDidCatch && (i5.componentDidCatch(n3, t4 || {}), o4 = i5.__d), o4) return i5.__E = i5;
    } catch (l6) {
      n3 = l6;
    }
    throw n3;
  } }, u = 0, t = function(n3) {
    return null != n3 && void 0 === n3.constructor;
  }, x.prototype.setState = function(n3, l5) {
    var u5;
    u5 = null != this.__s && this.__s != this.state ? this.__s : this.__s = w({}, this.state), "function" == typeof n3 && (n3 = n3(w({}, u5), this.props)), n3 && w(u5, n3), null != n3 && this.__v && (l5 && this._sb.push(l5), $(this));
  }, x.prototype.forceUpdate = function(n3) {
    this.__v && (this.__e = true, n3 && this.__h.push(n3), $(this));
  }, x.prototype.render = k, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n3, l5) {
    return n3.__v.__b - l5.__v.__b;
  }, I.__r = 0, f = /(PointerCapture)$|Capture$/i, c = 0, s = O(false), a = O(true), h = 0;

  // node_modules/preact/hooks/dist/hooks.module.js
  var t2;
  var r2;
  var u2;
  var i2;
  var o2 = 0;
  var f2 = [];
  var c2 = l;
  var e2 = c2.__b;
  var a2 = c2.__r;
  var v2 = c2.diffed;
  var l2 = c2.__c;
  var m2 = c2.unmount;
  var s2 = c2.__;
  function p2(n3, t4) {
    c2.__h && c2.__h(r2, n3, o2 || t4), o2 = 0;
    var u5 = r2.__H || (r2.__H = { __: [], __h: [] });
    return n3 >= u5.__.length && u5.__.push({}), u5.__[n3];
  }
  function d2(n3) {
    return o2 = 1, h2(D2, n3);
  }
  function h2(n3, u5, i5) {
    var o4 = p2(t2++, 2);
    if (o4.t = n3, !o4.__c && (o4.__ = [i5 ? i5(u5) : D2(void 0, u5), function(n4) {
      var t4 = o4.__N ? o4.__N[0] : o4.__[0], r4 = o4.t(t4, n4);
      t4 !== r4 && (o4.__N = [r4, o4.__[1]], o4.__c.setState({}));
    }], o4.__c = r2, !r2.__f)) {
      var f5 = function(n4, t4, r4) {
        if (!o4.__c.__H) return true;
        var u6 = o4.__c.__H.__.filter(function(n5) {
          return n5.__c;
        });
        if (u6.every(function(n5) {
          return !n5.__N;
        })) return !c4 || c4.call(this, n4, t4, r4);
        var i6 = o4.__c.props !== n4;
        return u6.some(function(n5) {
          if (n5.__N) {
            var t5 = n5.__[0];
            n5.__ = n5.__N, n5.__N = void 0, t5 !== n5.__[0] && (i6 = true);
          }
        }), c4 && c4.call(this, n4, t4, r4) || i6;
      };
      r2.__f = true;
      var c4 = r2.shouldComponentUpdate, e4 = r2.componentWillUpdate;
      r2.componentWillUpdate = function(n4, t4, r4) {
        if (this.__e) {
          var u6 = c4;
          c4 = void 0, f5(n4, t4, r4), c4 = u6;
        }
        e4 && e4.call(this, n4, t4, r4);
      }, r2.shouldComponentUpdate = f5;
    }
    return o4.__N || o4.__;
  }
  function y2(n3, u5) {
    var i5 = p2(t2++, 3);
    !c2.__s && C2(i5.__H, u5) && (i5.__ = n3, i5.u = u5, r2.__H.__h.push(i5));
  }
  function _(n3, u5) {
    var i5 = p2(t2++, 4);
    !c2.__s && C2(i5.__H, u5) && (i5.__ = n3, i5.u = u5, r2.__h.push(i5));
  }
  function A2(n3) {
    return o2 = 5, T2(function() {
      return { current: n3 };
    }, []);
  }
  function T2(n3, r4) {
    var u5 = p2(t2++, 7);
    return C2(u5.__H, r4) && (u5.__ = n3(), u5.__H = r4, u5.__h = n3), u5.__;
  }
  function q2(n3, t4) {
    return o2 = 8, T2(function() {
      return n3;
    }, t4);
  }
  function j2() {
    for (var n3; n3 = f2.shift(); ) {
      var t4 = n3.__H;
      if (n3.__P && t4) try {
        t4.__h.some(z2), t4.__h.some(B2), t4.__h = [];
      } catch (r4) {
        t4.__h = [], c2.__e(r4, n3.__v);
      }
    }
  }
  c2.__b = function(n3) {
    r2 = null, e2 && e2(n3);
  }, c2.__ = function(n3, t4) {
    n3 && t4.__k && t4.__k.__m && (n3.__m = t4.__k.__m), s2 && s2(n3, t4);
  }, c2.__r = function(n3) {
    a2 && a2(n3), t2 = 0;
    var i5 = (r2 = n3.__c).__H;
    i5 && (u2 === r2 ? (i5.__h = [], r2.__h = [], i5.__.some(function(n4) {
      n4.__N && (n4.__ = n4.__N), n4.u = n4.__N = void 0;
    })) : (i5.__h.some(z2), i5.__h.some(B2), i5.__h = [], t2 = 0)), u2 = r2;
  }, c2.diffed = function(n3) {
    v2 && v2(n3);
    var t4 = n3.__c;
    t4 && t4.__H && (t4.__H.__h.length && (1 !== f2.push(t4) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t4.__H.__.some(function(n4) {
      n4.u && (n4.__H = n4.u), n4.u = void 0;
    })), u2 = r2 = null;
  }, c2.__c = function(n3, t4) {
    t4.some(function(n4) {
      try {
        n4.__h.some(z2), n4.__h = n4.__h.filter(function(n5) {
          return !n5.__ || B2(n5);
        });
      } catch (r4) {
        t4.some(function(n5) {
          n5.__h && (n5.__h = []);
        }), t4 = [], c2.__e(r4, n4.__v);
      }
    }), l2 && l2(n3, t4);
  }, c2.unmount = function(n3) {
    m2 && m2(n3);
    var t4, r4 = n3.__c;
    r4 && r4.__H && (r4.__H.__.some(function(n4) {
      try {
        z2(n4);
      } catch (n5) {
        t4 = n5;
      }
    }), r4.__H = void 0, t4 && c2.__e(t4, r4.__v));
  };
  var k2 = "function" == typeof requestAnimationFrame;
  function w2(n3) {
    var t4, r4 = function() {
      clearTimeout(u5), k2 && cancelAnimationFrame(t4), setTimeout(n3);
    }, u5 = setTimeout(r4, 35);
    k2 && (t4 = requestAnimationFrame(r4));
  }
  function z2(n3) {
    var t4 = r2, u5 = n3.__c;
    "function" == typeof u5 && (n3.__c = void 0, u5()), r2 = t4;
  }
  function B2(n3) {
    var t4 = r2;
    n3.__c = n3.__(), r2 = t4;
  }
  function C2(n3, t4) {
    return !n3 || n3.length !== t4.length || t4.some(function(t5, r4) {
      return t5 !== n3[r4];
    });
  }
  function D2(n3, t4) {
    return "function" == typeof t4 ? t4(n3) : t4;
  }

  // node_modules/@preact/signals-core/dist/signals-core.module.js
  var i3 = Symbol.for("preact-signals");
  function t3() {
    if (!(s3 > 1)) {
      var i5, t4 = false;
      !function() {
        var i6 = d3;
        d3 = void 0;
        while (void 0 !== i6) {
          if (i6.S.v === i6.v) i6.S.i = i6.i;
          i6 = i6.o;
        }
      }();
      while (void 0 !== h3) {
        var n3 = h3;
        h3 = void 0;
        v3++;
        while (void 0 !== n3) {
          var r4 = n3.u;
          n3.u = void 0;
          n3.f &= -3;
          if (!(8 & n3.f) && w3(n3)) try {
            n3.c();
          } catch (n4) {
            if (!t4) {
              i5 = n4;
              t4 = true;
            }
          }
          n3 = r4;
        }
      }
      v3 = 0;
      s3--;
      if (t4) throw i5;
    } else s3--;
  }
  function n2(i5) {
    if (s3 > 0) return i5();
    e3 = ++u3;
    s3++;
    try {
      return i5();
    } finally {
      t3();
    }
  }
  var r3 = void 0;
  function o3(i5) {
    var t4 = r3;
    r3 = void 0;
    try {
      return i5();
    } finally {
      r3 = t4;
    }
  }
  var f3;
  var h3 = void 0;
  var s3 = 0;
  var v3 = 0;
  var u3 = 0;
  var e3 = 0;
  var d3 = void 0;
  var c3 = 0;
  function a3(i5) {
    if (void 0 !== r3) {
      var t4 = i5.n;
      if (void 0 === t4 || t4.t !== r3) {
        t4 = { i: 0, S: i5, p: r3.s, n: void 0, t: r3, e: void 0, x: void 0, r: t4 };
        if (void 0 !== r3.s) r3.s.n = t4;
        r3.s = t4;
        i5.n = t4;
        if (32 & r3.f) i5.S(t4);
        return t4;
      } else if (-1 === t4.i) {
        t4.i = 0;
        if (void 0 !== t4.n) {
          t4.n.p = t4.p;
          if (void 0 !== t4.p) t4.p.n = t4.n;
          t4.p = r3.s;
          t4.n = void 0;
          r3.s.n = t4;
          r3.s = t4;
        }
        return t4;
      }
    }
  }
  function l3(i5, t4) {
    this.v = i5;
    this.i = 0;
    this.n = void 0;
    this.t = void 0;
    this.l = 0;
    this.W = null == t4 ? void 0 : t4.watched;
    this.Z = null == t4 ? void 0 : t4.unwatched;
    this.name = null == t4 ? void 0 : t4.name;
  }
  l3.prototype.brand = i3;
  l3.prototype.h = function() {
    return true;
  };
  l3.prototype.S = function(i5) {
    var t4 = this, n3 = this.t;
    if (n3 !== i5 && void 0 === i5.e) {
      i5.x = n3;
      this.t = i5;
      if (void 0 !== n3) n3.e = i5;
      else o3(function() {
        var i6;
        null == (i6 = t4.W) || i6.call(t4);
      });
    }
  };
  l3.prototype.U = function(i5) {
    var t4 = this;
    if (void 0 !== this.t) {
      var n3 = i5.e, r4 = i5.x;
      if (void 0 !== n3) {
        n3.x = r4;
        i5.e = void 0;
      }
      if (void 0 !== r4) {
        r4.e = n3;
        i5.x = void 0;
      }
      if (i5 === this.t) {
        this.t = r4;
        if (void 0 === r4) o3(function() {
          var i6;
          null == (i6 = t4.Z) || i6.call(t4);
        });
      }
    }
  };
  l3.prototype.subscribe = function(i5) {
    var t4 = this;
    return C3(function() {
      var n3 = t4.value, o4 = r3;
      r3 = void 0;
      try {
        i5(n3);
      } finally {
        r3 = o4;
      }
    }, { name: "sub" });
  };
  l3.prototype.valueOf = function() {
    return this.value;
  };
  l3.prototype.toString = function() {
    return this.value + "";
  };
  l3.prototype.toJSON = function() {
    return this.value;
  };
  l3.prototype.peek = function() {
    var i5 = r3;
    r3 = void 0;
    try {
      return this.value;
    } finally {
      r3 = i5;
    }
  };
  Object.defineProperty(l3.prototype, "value", { get: function() {
    var i5 = a3(this);
    if (void 0 !== i5) i5.i = this.i;
    return this.v;
  }, set: function(i5) {
    if (i5 !== this.v) {
      if (v3 > 100) throw new Error("Cycle detected");
      !function(i6) {
        if (0 !== s3 && 0 === v3) {
          if (i6.l !== e3) {
            i6.l = e3;
            d3 = { S: i6, v: i6.v, i: i6.i, o: d3 };
          }
        }
      }(this);
      this.v = i5;
      this.i++;
      c3++;
      s3++;
      try {
        for (var n3 = this.t; void 0 !== n3; n3 = n3.x) n3.t.N();
      } finally {
        t3();
      }
    }
  } });
  function y3(i5, t4) {
    return new l3(i5, t4);
  }
  function w3(i5) {
    for (var t4 = i5.s; void 0 !== t4; t4 = t4.n) if (t4.S.i !== t4.i || !t4.S.h() || t4.S.i !== t4.i) return true;
    return false;
  }
  function _2(i5) {
    for (var t4 = i5.s; void 0 !== t4; t4 = t4.n) {
      var n3 = t4.S.n;
      if (void 0 !== n3) t4.r = n3;
      t4.S.n = t4;
      t4.i = -1;
      if (void 0 === t4.n) {
        i5.s = t4;
        break;
      }
    }
  }
  function b(i5) {
    var t4 = i5.s, n3 = void 0;
    while (void 0 !== t4) {
      var r4 = t4.p;
      if (-1 === t4.i) {
        t4.S.U(t4);
        if (void 0 !== r4) r4.n = t4.n;
        if (void 0 !== t4.n) t4.n.p = r4;
      } else n3 = t4;
      t4.S.n = t4.r;
      if (void 0 !== t4.r) t4.r = void 0;
      t4 = r4;
    }
    i5.s = n3;
  }
  function p3(i5, t4) {
    l3.call(this, void 0);
    this.x = i5;
    this.s = void 0;
    this.g = c3 - 1;
    this.f = 4;
    this.W = null == t4 ? void 0 : t4.watched;
    this.Z = null == t4 ? void 0 : t4.unwatched;
    this.name = null == t4 ? void 0 : t4.name;
  }
  p3.prototype = new l3();
  p3.prototype.h = function() {
    this.f &= -3;
    if (1 & this.f) return false;
    if (32 == (36 & this.f)) return true;
    this.f &= -5;
    if (this.g === c3) return true;
    this.g = c3;
    this.f |= 1;
    if (this.i > 0 && !w3(this)) {
      this.f &= -2;
      return true;
    }
    var i5 = r3;
    try {
      _2(this);
      r3 = this;
      var t4 = this.x();
      if (16 & this.f || this.v !== t4 || 0 === this.i) {
        this.v = t4;
        this.f &= -17;
        this.i++;
      }
    } catch (i6) {
      this.v = i6;
      this.f |= 16;
      this.i++;
    }
    r3 = i5;
    b(this);
    this.f &= -2;
    return true;
  };
  p3.prototype.S = function(i5) {
    if (void 0 === this.t) {
      this.f |= 36;
      for (var t4 = this.s; void 0 !== t4; t4 = t4.n) t4.S.S(t4);
    }
    l3.prototype.S.call(this, i5);
  };
  p3.prototype.U = function(i5) {
    if (void 0 !== this.t) {
      l3.prototype.U.call(this, i5);
      if (void 0 === this.t) {
        this.f &= -33;
        for (var t4 = this.s; void 0 !== t4; t4 = t4.n) t4.S.U(t4);
      }
    }
  };
  p3.prototype.N = function() {
    if (!(2 & this.f)) {
      this.f |= 6;
      for (var i5 = this.t; void 0 !== i5; i5 = i5.x) i5.t.N();
    }
  };
  Object.defineProperty(p3.prototype, "value", { get: function() {
    if (1 & this.f) throw new Error("Cycle detected");
    var i5 = a3(this);
    this.h();
    if (void 0 !== i5) i5.i = this.i;
    if (16 & this.f) throw this.v;
    return this.v;
  } });
  function g2(i5, t4) {
    return new p3(i5, t4);
  }
  function S2(i5) {
    var n3 = i5.m;
    i5.m = void 0;
    if ("function" == typeof n3) {
      s3++;
      var o4 = r3;
      r3 = void 0;
      try {
        n3();
      } catch (t4) {
        i5.f &= -2;
        i5.f |= 8;
        m3(i5);
        throw t4;
      } finally {
        r3 = o4;
        t3();
      }
    }
  }
  function m3(i5) {
    for (var t4 = i5.s; void 0 !== t4; t4 = t4.n) t4.S.U(t4);
    i5.x = void 0;
    i5.s = void 0;
    S2(i5);
  }
  function x2(i5) {
    if (r3 !== this) throw new Error("Out-of-order effect");
    b(this);
    r3 = i5;
    this.f &= -2;
    if (8 & this.f) m3(this);
    t3();
  }
  function E2(i5, t4) {
    this.x = i5;
    this.m = void 0;
    this.s = void 0;
    this.u = void 0;
    this.f = 32;
    this.name = null == t4 ? void 0 : t4.name;
    if (f3) f3.push(this);
  }
  E2.prototype.c = function() {
    var i5 = this.S();
    try {
      if (8 & this.f) return;
      if (void 0 === this.x) return;
      var t4 = this.x();
      if ("function" == typeof t4) this.m = t4;
    } finally {
      i5();
    }
  };
  E2.prototype.S = function() {
    if (1 & this.f) throw new Error("Cycle detected");
    this.f |= 1;
    this.f &= -9;
    S2(this);
    _2(this);
    s3++;
    var i5 = r3;
    r3 = this;
    return x2.bind(this, i5);
  };
  E2.prototype.N = function() {
    if (!(2 & this.f)) {
      this.f |= 2;
      this.u = h3;
      h3 = this;
    }
  };
  E2.prototype.d = function() {
    this.f |= 8;
    if (!(1 & this.f)) m3(this);
  };
  E2.prototype.dispose = function() {
    this.d();
  };
  function C3(i5, t4) {
    var n3 = new E2(i5, t4);
    try {
      n3.c();
    } catch (i6) {
      n3.d();
      throw i6;
    }
    var r4 = n3.d.bind(n3);
    r4[Symbol.dispose] = r4;
    return r4;
  }

  // node_modules/@preact/signals/dist/signals.module.js
  var l4;
  var d4;
  var h4;
  var p4 = "undefined" != typeof window && !!window.__PREACT_SIGNALS_DEVTOOLS__;
  var _3 = [];
  C3(function() {
    l4 = this.N;
  })();
  function g3(i5, r4) {
    l[i5] = r4.bind(null, l[i5] || function() {
    });
  }
  function b2(i5) {
    if (h4) {
      var n3 = h4;
      h4 = void 0;
      n3();
    }
    h4 = i5 && i5.S();
  }
  function y4(i5) {
    var n3 = this, t4 = i5.data, e4 = useSignal(t4);
    e4.value = t4;
    var f5 = T2(function() {
      var i6 = n3, t5 = n3.__v;
      while (t5 = t5.__) if (t5.__c) {
        t5.__c.__$f |= 4;
        break;
      }
      var o4 = g2(function() {
        var i7 = e4.value.value;
        return 0 === i7 ? 0 : true === i7 ? "" : i7 || "";
      }), f6 = g2(function() {
        return !Array.isArray(o4.value) && !t(o4.value);
      }), a5 = C3(function() {
        this.N = F2;
        if (f6.value) {
          var n4 = o4.value;
          if (i6.__v && i6.__v.__e && 3 === i6.__v.__e.nodeType) i6.__v.__e.data = n4;
        }
      }), v5 = n3.__$u.d;
      n3.__$u.d = function() {
        a5();
        v5.call(this);
      };
      return [f6, o4];
    }, []), a4 = f5[0], v4 = f5[1];
    return a4.value ? v4.peek() : v4.value;
  }
  y4.displayName = "ReactiveTextNode";
  Object.defineProperties(l3.prototype, { constructor: { configurable: true, value: void 0 }, type: { configurable: true, value: y4 }, props: { configurable: true, get: function() {
    var i5 = this;
    return { data: { get value() {
      return i5.value;
    } } };
  } }, __b: { configurable: true, value: 1 } });
  g3("__b", function(i5, n3) {
    if ("string" == typeof n3.type) {
      var r4, t4 = n3.props;
      for (var o4 in t4) if ("children" !== o4) {
        var e4 = t4[o4];
        if (e4 instanceof l3) {
          if (!r4) n3.__np = r4 = {};
          r4[o4] = e4;
          t4[o4] = e4.peek();
        }
      }
    }
    i5(n3);
  });
  g3("__r", function(i5, n3) {
    i5(n3);
    if (n3.type !== k) {
      b2();
      var r4, o4 = n3.__c;
      if (o4) {
        o4.__$f &= -2;
        if (void 0 === (r4 = o4.__$u)) o4.__$u = r4 = function(i6, n4) {
          var r5;
          C3(function() {
            r5 = this;
          }, { name: n4 });
          r5.c = i6;
          return r5;
        }(function() {
          var i6;
          if (p4) null == (i6 = r4.y) || i6.call(r4);
          o4.__$f |= 1;
          o4.setState({});
        }, "function" == typeof n3.type ? n3.type.displayName || n3.type.name : "");
      }
      d4 = o4;
      b2(r4);
    }
  });
  g3("__e", function(i5, n3, r4, t4) {
    b2();
    d4 = void 0;
    i5(n3, r4, t4);
  });
  g3("diffed", function(i5, n3) {
    b2();
    d4 = void 0;
    var r4;
    if ("string" == typeof n3.type && (r4 = n3.__e)) {
      var t4 = n3.__np, o4 = n3.props;
      if (t4) {
        var e4 = r4.U;
        if (e4) for (var f5 in e4) {
          var u5 = e4[f5];
          if (void 0 !== u5 && !(f5 in t4)) {
            u5.d();
            e4[f5] = void 0;
          }
        }
        else {
          e4 = {};
          r4.U = e4;
        }
        for (var a4 in t4) {
          var c4 = e4[a4], v4 = t4[a4];
          if (void 0 === c4) {
            c4 = w4(r4, a4, v4);
            e4[a4] = c4;
          } else c4.o(v4, o4);
        }
        for (var s4 in t4) o4[s4] = t4[s4];
      }
    }
    i5(n3);
  });
  function w4(i5, n3, r4, t4) {
    var o4 = n3 in i5 && void 0 === i5.ownerSVGElement, e4 = y3(r4), f5 = r4.peek();
    return { o: function(i6, n4) {
      e4.value = i6;
      f5 = i6.peek();
    }, d: C3(function() {
      this.N = F2;
      var r5 = e4.value.value;
      if (f5 !== r5) {
        f5 = void 0;
        if (o4) i5[n3] = r5;
        else if (null != r5 && (false !== r5 || "-" === n3[4])) i5.setAttribute(n3, r5);
        else i5.removeAttribute(n3);
      } else f5 = void 0;
    }) };
  }
  g3("unmount", function(i5, n3) {
    if ("string" == typeof n3.type) {
      var r4 = n3.__e;
      if (r4) {
        var t4 = r4.U;
        if (t4) {
          r4.U = void 0;
          for (var o4 in t4) {
            var e4 = t4[o4];
            if (e4) e4.d();
          }
        }
      }
      n3.__np = void 0;
    } else {
      var f5 = n3.__c;
      if (f5) {
        var u5 = f5.__$u;
        if (u5) {
          f5.__$u = void 0;
          u5.d();
        }
      }
    }
    i5(n3);
  });
  g3("__h", function(i5, n3, r4, t4) {
    if (t4 < 3 || 9 === t4) n3.__$f |= 2;
    i5(n3, r4, t4);
  });
  x.prototype.shouldComponentUpdate = function(i5, n3) {
    if (this.__R) return true;
    var r4 = this.__$u, t4 = r4 && void 0 !== r4.s;
    for (var o4 in n3) return true;
    if (this.__f || "boolean" == typeof this.u && true === this.u) {
      var e4 = 2 & this.__$f;
      if (!(t4 || e4 || 4 & this.__$f)) return true;
      if (1 & this.__$f) return true;
    } else {
      if (!(t4 || 4 & this.__$f)) return true;
      if (3 & this.__$f) return true;
    }
    for (var f5 in i5) if ("__source" !== f5 && i5[f5] !== this.props[f5]) return true;
    for (var u5 in this.props) if (!(u5 in i5)) return true;
    return false;
  };
  function useSignal(i5, n3) {
    return T2(function() {
      return y3(i5, n3);
    }, []);
  }
  var q3 = function(i5) {
    queueMicrotask(function() {
      queueMicrotask(i5);
    });
  };
  function x3() {
    n2(function() {
      var i5;
      while (i5 = _3.shift()) l4.call(i5);
    });
  }
  function F2() {
    if (1 === _3.push(this)) (l.requestAnimationFrame || q3)(x3);
  }

  // src/db.ts
  var encode = (s4) => new TextEncoder().encode(s4);
  var escapeRegex = (s4) => s4.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var store;
  var pageData = y3({});
  var blockData = y3({});
  var currentPage = y3(null);
  var activeBlockId = y3(null);
  var pageList = g2(
    () => Object.values(pageData.value).sort((a4, b3) => {
      const aJ = a4.folder === "journals", bJ = b3.folder === "journals";
      if (aJ && !bJ) return -1;
      if (!aJ && bJ) return 1;
      if (aJ && bJ) return b3.title.localeCompare(a4.title);
      return a4.title.localeCompare(b3.title);
    })
  );
  var tentativePages = /* @__PURE__ */ new Set();
  var tentativeBlocks = /* @__PURE__ */ new Set();
  function materializePage(pageId) {
    if (!tentativePages.has(pageId)) return;
    tentativePages.delete(pageId);
    const page = pageData.value[pageId];
    if (page) {
      const { id, ...rest } = page;
      store?.Put({ key: encode("page/" + id), value: encode(JSON.stringify(rest)) });
    }
    for (const blockId of [...tentativeBlocks]) {
      const block = blockData.value[blockId];
      if (block?.pageId === pageId) {
        tentativeBlocks.delete(blockId);
        const { id, ...rest } = block;
        store?.Put({ key: encode("block/" + id), value: encode(JSON.stringify(rest)) });
      }
    }
  }
  function discardTentativePage(pageId) {
    if (!tentativePages.has(pageId)) return;
    tentativePages.delete(pageId);
    const next = {};
    for (const [id, b3] of Object.entries(blockData.value)) {
      if (b3.pageId === pageId && tentativeBlocks.has(id)) {
        tentativeBlocks.delete(id);
      } else {
        next[id] = b3;
      }
    }
    blockData.value = next;
    const { [pageId]: _4, ...restPages } = pageData.value;
    pageData.value = restPages;
  }
  function getOrCreatePage(title, folder) {
    const existing = Object.values(pageData.value).find((p5) => p5.title === title);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const resolvedFolder = folder ?? (isJournalSlug(title) ? "journals" : void 0);
    const page = { id, title, slug, folder: resolvedFolder, createdAt: now, updatedAt: now };
    pageData.value = { ...pageData.value, [id]: page };
    store?.Put({ key: encode("page/" + id), value: encode(JSON.stringify({ title, slug, folder: resolvedFolder, createdAt: now, updatedAt: now })) });
    return id;
  }
  async function deletePage(pageId) {
    const deletes = [];
    const next = {};
    for (const [id, b3] of Object.entries(blockData.value)) {
      if (b3.pageId === pageId) deletes.push(store.Delete({ key: encode("block/" + id) }));
      else next[id] = b3;
    }
    blockData.value = next;
    deletes.push(store.Delete({ key: encode("page/" + pageId) }));
    const { [pageId]: _4, ...restPages } = pageData.value;
    pageData.value = restPages;
    if (currentPage.value === pageId) currentPage.value = null;
    await Promise.all(deletes);
  }
  function navigateTo(title) {
    const prev = currentPage.value;
    if (prev && tentativePages.has(prev)) {
      const hasContent = Object.values(blockData.value).some(
        (b3) => b3.pageId === prev && b3.content.trim() !== ""
      );
      if (!hasContent) discardTentativePage(prev);
    }
    const existing = Object.values(pageData.value).find((p5) => p5.title === title);
    if (existing) {
      const hasBlocks = Object.values(blockData.value).some((b3) => b3.pageId === existing.id);
      if (!hasBlocks) {
        const id2 = crypto.randomUUID();
        undoRedoInProgress = true;
        saveBlock({ id: id2, content: "", pageId: existing.id, parent: null, order: 0 });
        undoRedoInProgress = false;
        activeBlockId.value = id2;
      }
      currentPage.value = existing.id;
      return;
    }
    const id = crypto.randomUUID();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const folder = isJournalSlug(title) ? "journals" : void 0;
    const page = { id, title, slug, folder, createdAt: now, updatedAt: now };
    pageData.value = { ...pageData.value, [id]: page };
    tentativePages.add(id);
    const blockId = crypto.randomUUID();
    const block = { id: blockId, content: "", pageId: id, parent: null, order: 0, createdAt: now, updatedAt: now };
    blockData.value = { ...blockData.value, [blockId]: block };
    tentativeBlocks.add(blockId);
    activeBlockId.value = blockId;
    currentPage.value = id;
  }
  function navigateById(pageId) {
    if (!pageData.value[pageId]) return;
    const prev = currentPage.value;
    if (prev && prev !== pageId && tentativePages.has(prev)) {
      const hasContent = Object.values(blockData.value).some(
        (b3) => b3.pageId === prev && b3.content.trim() !== ""
      );
      if (!hasContent) discardTentativePage(prev);
    }
    const hasBlocks = Object.values(blockData.value).some((b3) => b3.pageId === pageId);
    if (!hasBlocks) {
      const id = crypto.randomUUID();
      undoRedoInProgress = true;
      saveBlock({ id, content: "", pageId, parent: null, order: 0 });
      undoRedoInProgress = false;
      activeBlockId.value = id;
    }
    currentPage.value = pageId;
  }
  var MAX_UNDO = 200;
  function storageKey(pageId, type) {
    return `outliner:${type}:${pageId}`;
  }
  function loadStack(pageId, type) {
    try {
      const raw = sessionStorage.getItem(storageKey(pageId, type));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function persistStack(pageId, type, stack) {
    const key = storageKey(pageId, type);
    const json = JSON.stringify(stack);
    while (true) {
      try {
        sessionStorage.setItem(key, json);
        return;
      } catch {
        if (stack.length > 1) {
          stack.shift();
        } else {
          sessionStorage.removeItem(key);
          return;
        }
      }
    }
  }
  var undoStacks = /* @__PURE__ */ new Map();
  var redoStacks = /* @__PURE__ */ new Map();
  function getUndoStack(pageId) {
    if (!undoStacks.has(pageId)) undoStacks.set(pageId, loadStack(pageId, "undo"));
    return undoStacks.get(pageId);
  }
  function getRedoStack(pageId) {
    if (!redoStacks.has(pageId)) redoStacks.set(pageId, loadStack(pageId, "redo"));
    return redoStacks.get(pageId);
  }
  var activeGroup = null;
  var groupLabel = "";
  var groupPageId = "";
  function beginUndo(label) {
    if (activeGroup) commitUndo();
    activeGroup = [];
    groupLabel = label;
    groupPageId = currentPage.value ?? "";
  }
  function commitUndo() {
    if (!activeGroup || activeGroup.length === 0 || !groupPageId) {
      activeGroup = null;
      return;
    }
    const stack = getUndoStack(groupPageId);
    stack.push({ label: groupLabel, patches: activeGroup });
    if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
    const redo2 = getRedoStack(groupPageId);
    redo2.length = 0;
    persistStack(groupPageId, "undo", stack);
    persistStack(groupPageId, "redo", redo2);
    activeGroup = null;
  }
  function recordPatch(id, before, after) {
    if (before && after && before.content === after.content && before.type === after.type && before.parent === after.parent && before.order === after.order && before.col === after.col) return;
    const pageId = before?.pageId ?? after.pageId;
    if (!activeGroup) {
      const stack = getUndoStack(pageId);
      stack.push({ label: "edit", patches: [{ id, before, after }] });
      if (stack.length > MAX_UNDO) stack.splice(0, stack.length - MAX_UNDO);
      const redo2 = getRedoStack(pageId);
      redo2.length = 0;
      persistStack(pageId, "undo", stack);
      persistStack(pageId, "redo", redo2);
      return;
    }
    activeGroup.push({ id, before, after });
  }
  var undoRedoInProgress = false;
  function canUndo() {
    const pageId = currentPage.value;
    return !!pageId && getUndoStack(pageId).length > 0;
  }
  function canRedo() {
    const pageId = currentPage.value;
    return !!pageId && getRedoStack(pageId).length > 0;
  }
  function undo() {
    const pageId = currentPage.value;
    if (!pageId) return;
    const stack = getUndoStack(pageId);
    const entry = stack.pop();
    if (!entry) return;
    undoRedoInProgress = true;
    for (let i5 = entry.patches.length - 1; i5 >= 0; i5--) {
      const { id, before } = entry.patches[i5];
      if (before) {
        saveBlock(before);
      } else {
        const next = { ...blockData.value };
        delete next[id];
        blockData.value = next;
        store?.Delete({ key: encode("block/" + id) });
      }
    }
    undoRedoInProgress = false;
    const redo2 = getRedoStack(pageId);
    redo2.push(entry);
    persistStack(pageId, "undo", stack);
    persistStack(pageId, "redo", redo2);
  }
  function redo() {
    const pageId = currentPage.value;
    if (!pageId) return;
    const redo2 = getRedoStack(pageId);
    const entry = redo2.pop();
    if (!entry) return;
    undoRedoInProgress = true;
    for (const { id, after } of entry.patches) {
      if (after) {
        saveBlock(after);
      } else {
        const next = { ...blockData.value };
        delete next[id];
        blockData.value = next;
        store?.Delete({ key: encode("block/" + id) });
      }
    }
    undoRedoInProgress = false;
    const stack = getUndoStack(pageId);
    stack.push(entry);
    persistStack(pageId, "undo", stack);
    persistStack(pageId, "redo", redo2);
  }
  function saveBlock(block) {
    const existing = blockData.value[block.id] ?? null;
    if (existing && existing.content === block.content && existing.type === block.type && existing.parent === block.parent && existing.order === block.order && existing.col === block.col && existing.pageId === block.pageId) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const saved = {
      ...block,
      createdAt: block.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now
    };
    if (!undoRedoInProgress) recordPatch(block.id, existing, saved);
    blockData.value = { ...blockData.value, [block.id]: saved };
    if (block.content.trim() !== "" && tentativePages.has(block.pageId)) {
      materializePage(block.pageId);
    }
    if (tentativeBlocks.has(block.id)) return;
    const { id, ...rest } = saved;
    store?.Put({ key: encode("block/" + id), value: encode(JSON.stringify(rest)) });
  }
  async function deleteBlock(id) {
    const toDelete = [id, ...collectDescendants(id)];
    if (!undoRedoInProgress) {
      for (const bid of toDelete) {
        const existing = blockData.value[bid];
        if (existing) recordPatch(bid, existing, null);
      }
    }
    const next = {};
    const deletes = [];
    for (const [bid, b3] of Object.entries(blockData.value)) {
      if (toDelete.includes(bid)) deletes.push(store.Delete({ key: encode("block/" + bid) }));
      else next[bid] = b3;
    }
    blockData.value = next;
    await Promise.all(deletes);
  }
  function collectDescendants(parentId) {
    const result = [];
    for (const b3 of Object.values(blockData.value)) {
      if (b3.parent === parentId) {
        result.push(b3.id);
        result.push(...collectDescendants(b3.id));
      }
    }
    return result;
  }
  function buildTree(pageId) {
    const blocks = Object.values(blockData.value).filter((b3) => b3.pageId === pageId);
    return buildSubtree(blocks, null);
  }
  function buildSubtree(blocks, parentId) {
    return blocks.filter((b3) => b3.parent === parentId).sort((a4, b3) => a4.order - b3.order).map((b3) => ({ ...b3, children: buildSubtree(blocks, b3.id) }));
  }
  function flattenTree(nodes, depth = 0) {
    const result = [];
    for (const node of nodes) {
      result.push({ ...node, depth });
      if (!collapsedBlocks.value.has(node.id)) {
        result.push(...flattenTree(node.children, depth + 1));
      }
    }
    return result;
  }
  function validateTree(pageId) {
    let repaired = 0;
    undoRedoInProgress = true;
    const allBlocks = Object.values(blockData.value).filter((b3) => b3.pageId === pageId);
    for (const block of allBlocks) {
      if (block.parent && !blockData.value[block.parent]) {
        saveBlock({ ...block, parent: null });
        repaired++;
      }
    }
    const flat = flattenTree(buildTree(pageId));
    const lastAtDepth = [null];
    for (const b3 of flat) {
      const block = blockData.value[b3.id];
      if (!block) continue;
      const maxDepth = lastAtDepth.length;
      const effectiveDepth = Math.min(b3.depth, maxDepth);
      const correctParent = effectiveDepth > 0 ? lastAtDepth[effectiveDepth - 1] ?? null : null;
      if (block.parent !== correctParent) {
        saveBlock({ ...block, parent: correctParent });
        repaired++;
      }
      lastAtDepth[effectiveDepth] = b3.id;
      lastAtDepth.length = effectiveDepth + 1;
    }
    undoRedoInProgress = false;
    return repaired;
  }
  function hasChildren(blockId) {
    return Object.values(blockData.value).some((b3) => b3.parent === blockId);
  }
  var collapsedBlocks = y3(/* @__PURE__ */ new Set());
  function loadCollapsed() {
    try {
      const raw = localStorage.getItem("outliner:collapsed");
      if (raw) collapsedBlocks.value = new Set(JSON.parse(raw));
    } catch {
    }
  }
  function persistCollapsed() {
    try {
      localStorage.setItem("outliner:collapsed", JSON.stringify([...collapsedBlocks.value]));
    } catch {
    }
  }
  function isCollapsed(blockId) {
    return collapsedBlocks.value.has(blockId);
  }
  function toggleCollapse(blockId) {
    const next = new Set(collapsedBlocks.value);
    if (next.has(blockId)) next.delete(blockId);
    else next.add(blockId);
    collapsedBlocks.value = next;
    persistCollapsed();
  }
  loadCollapsed();
  function isDescendant(blockId, ancestorId) {
    let current = blockData.value[blockId];
    while (current?.parent) {
      if (current.parent === ancestorId) return true;
      current = blockData.value[current.parent];
    }
    return false;
  }
  function fixHeadingSections(pageId, parent) {
    const siblings = Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === parent).sort((a4, b3) => a4.order - b3.order);
    let currentHeading = null;
    for (const sib of siblings) {
      if (blockKind(sib) === "heading") {
        currentHeading = sib.id;
      } else if (currentHeading) {
        const children = Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === currentHeading);
        saveBlock({ ...sib, parent: currentHeading, order: nextOrder(children) });
      }
    }
  }
  function moveBlock(blockId, targetId, position) {
    const block = blockData.value[blockId];
    const target = blockData.value[targetId];
    if (!block || !target || blockId === targetId) return;
    if (isDescendant(targetId, blockId)) return;
    const sourceParent = block.parent;
    const sourcePageId = block.pageId;
    if (position === "nested") {
      if (!canAcceptChildren(target)) return;
      const children = Object.values(blockData.value).filter((b3) => b3.pageId === target.pageId && b3.parent === targetId).sort((a4, b3) => a4.order - b3.order);
      const firstOrder = children.length > 0 ? children[0].order : 0;
      saveBlock({ ...block, parent: targetId, pageId: target.pageId, order: orderBetween(void 0, firstOrder) });
      fixHeadingSections(target.pageId, targetId);
      fixHeadingSections(sourcePageId, sourceParent);
      return;
    }
    if (!canBeSiblingAt(block, target.pageId, target.parent)) return;
    const siblings = Object.values(blockData.value).filter((b3) => b3.pageId === target.pageId && b3.parent === target.parent && b3.id !== blockId).sort((a4, b3) => a4.order - b3.order);
    const targetIdx = siblings.findIndex((b3) => b3.id === targetId);
    let order;
    if (position === "before") {
      const prev = targetIdx > 0 ? siblings[targetIdx - 1] : null;
      order = orderBetween(prev?.order, target.order);
    } else {
      const next = targetIdx < siblings.length - 1 ? siblings[targetIdx + 1] : null;
      order = orderBetween(target.order, next?.order);
    }
    saveBlock({ ...block, parent: target.parent, pageId: target.pageId, order });
    fixHeadingSections(target.pageId, target.parent);
    fixHeadingSections(sourcePageId, sourceParent);
  }
  function getSiblings(blockId) {
    const block = blockData.value[blockId];
    if (!block) return [];
    return Object.values(blockData.value).filter((b3) => b3.pageId === block.pageId && b3.parent === block.parent).sort((a4, b3) => a4.order - b3.order);
  }
  function nextOrder(siblings) {
    return siblings.reduce((m4, s4) => Math.max(m4, s4.order), -1) + 1;
  }
  function orderBetween(a4, b3) {
    if (a4 == null && b3 == null) return 0;
    if (a4 == null) return b3 - 1;
    if (b3 == null) return a4 + 1;
    return (a4 + b3) / 2;
  }
  function maybeRebalance(pageId, parent) {
    const siblings = Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === parent).sort((a4, b3) => a4.order - b3.order);
    if (siblings.length < 2) return;
    for (let i5 = 1; i5 < siblings.length; i5++) {
      if (Math.abs(siblings[i5].order - siblings[i5 - 1].order) < 1e-8) {
        siblings.forEach((s4, idx) => {
          if (s4.order !== idx) saveBlock({ ...s4, order: idx });
        });
        return;
      }
    }
  }
  function blockKind(block) {
    if (block.type === "table") return "table";
    if (block.type === "paragraph") {
      return parseHeading(block.content).level ? "heading" : "paragraph";
    }
    return "bullet";
  }
  function canAcceptChildren(block) {
    const kind = blockKind(block);
    return kind === "bullet" || kind === "heading";
  }
  function isStructuralBlock(block) {
    return blockKind(block) === "heading";
  }
  function canBeSiblingAt(block, pageId, parent) {
    const levelKinds = new Set(
      Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === parent).map((b3) => blockKind(b3))
    );
    const kind = blockKind(block);
    if (kind === "table") return true;
    if (levelKinds.has("heading")) return kind === "heading";
    return kind === "bullet" || kind === "paragraph";
  }
  function createBlockAfter(afterId, content = "", type) {
    const after = blockData.value[afterId];
    if (!after) return "";
    const blockType = type ?? after.type ?? "bullet";
    const provisional = { content, type: blockType };
    if (!canBeSiblingAt(provisional, after.pageId, after.parent) && canAcceptChildren(after)) {
      return createChildBlock(afterId, content, blockType);
    }
    const siblings = getSiblings(afterId);
    const idx = siblings.findIndex((b3) => b3.id === afterId);
    const next = siblings[idx + 1];
    const order = orderBetween(after.order, next?.order);
    const id = crypto.randomUUID();
    saveBlock({ id, content, pageId: after.pageId, parent: after.parent, order, type: blockType });
    maybeRebalance(after.pageId, after.parent);
    return id;
  }
  function createChildBlock(parentId, content = "", type = "bullet") {
    const parent = blockData.value[parentId];
    if (!parent) return "";
    const children = Object.values(blockData.value).filter((b3) => b3.pageId === parent.pageId && b3.parent === parentId);
    const id = crypto.randomUUID();
    saveBlock({ id, content, pageId: parent.pageId, parent: parentId, order: nextOrder(children), type });
    return id;
  }
  function indentBlock(blockId) {
    const block = blockData.value[blockId];
    if (!block) return;
    if (isStructuralBlock(block)) return;
    const siblings = getSiblings(blockId);
    const idx = siblings.findIndex((b3) => b3.id === blockId);
    if (idx <= 0) return;
    const newParent = siblings[idx - 1];
    if (!canAcceptChildren(newParent)) return;
    const children = Object.values(blockData.value).filter((b3) => b3.pageId === block.pageId && b3.parent === newParent.id);
    saveBlock({ ...block, parent: newParent.id, order: nextOrder(children) });
  }
  function outdentBlock(blockId) {
    const block = blockData.value[blockId];
    if (!block?.parent) return;
    const parent = blockData.value[block.parent];
    if (!parent) return;
    if (isStructuralBlock(block)) return;
    if (isStructuralBlock(parent)) return;
    if (!canBeSiblingAt(block, block.pageId, parent.parent)) return;
    const parentSiblings = Object.values(blockData.value).filter((b3) => b3.pageId === block.pageId && b3.parent === parent.parent).sort((a4, b3) => a4.order - b3.order);
    const parentIdx = parentSiblings.findIndex((b3) => b3.id === parent.id);
    const nextSib = parentSiblings[parentIdx + 1];
    const order = orderBetween(parent.order, nextSib?.order);
    saveBlock({ ...block, parent: parent.parent, order });
  }
  function joinBlockWithPrevious(blockId) {
    const block = blockData.value[blockId];
    if (!block) return null;
    const tree = buildTree(block.pageId);
    const flat = flattenTree(tree);
    const idx = flat.findIndex((b3) => b3.id === blockId);
    if (idx <= 0) return null;
    const prev = flat[idx - 1];
    const prevContent = prev.content;
    const currentContent = block.content;
    const joinedContent = prevContent + currentContent;
    const cursorPos = prevContent.length;
    saveBlock({ ...blockData.value[prev.id], content: joinedContent });
    deleteBlock(blockId);
    return { prevId: prev.id, cursorPos };
  }
  function removeBlock(blockId) {
    const block = blockData.value[blockId];
    if (!block) return null;
    const hasKids = Object.values(blockData.value).some((b3) => b3.parent === blockId);
    if (hasKids) return null;
    const tree = buildTree(block.pageId);
    const flat = flattenTree(tree);
    const idx = flat.findIndex((b3) => b3.id === blockId);
    if (idx <= 0) {
      if (flat.length > 1) {
        deleteBlock(blockId);
        return flat[1].id;
      }
      return null;
    }
    const prevId = flat[idx - 1].id;
    deleteBlock(blockId);
    return prevId;
  }
  function getTableGrid(tableId) {
    const children = Object.values(blockData.value).filter((b3) => b3.parent === tableId);
    const rowMap = /* @__PURE__ */ new Map();
    for (const c4 of children) {
      const row = rowMap.get(c4.order) ?? [];
      row.push(c4);
      rowMap.set(c4.order, row);
    }
    return [...rowMap.entries()].sort(([a4], [b3]) => a4 - b3).map(([order, cells]) => ({ order, cells: cells.sort((a4, b3) => (a4.col ?? 0) - (b3.col ?? 0)) }));
  }
  function createTable(afterId, rows) {
    const after = blockData.value[afterId];
    if (!after) return "";
    const siblings = getSiblings(afterId);
    const idx = siblings.findIndex((b3) => b3.id === afterId);
    const next = siblings[idx + 1];
    const tableOrder = orderBetween(after.order, next?.order);
    const tableId = crypto.randomUUID();
    saveBlock({ id: tableId, content: "", pageId: after.pageId, parent: after.parent, order: tableOrder, type: "table" });
    for (let r4 = 0; r4 < rows.length; r4++) {
      for (let c4 = 0; c4 < rows[r4].length; c4++) {
        const id = crypto.randomUUID();
        saveBlock({ id, content: rows[r4][c4], pageId: after.pageId, parent: tableId, order: r4, col: c4 });
      }
    }
    maybeRebalance(after.pageId, after.parent);
    return tableId;
  }
  function insertTableRow(tableId, afterRowOrder) {
    const grid = getTableGrid(tableId);
    const table = blockData.value[tableId];
    if (!table) return [];
    const colCount = grid.length > 0 ? grid[0].cells.length : 1;
    const colOrders = grid.length > 0 ? grid[0].cells.map((c4) => c4.col ?? 0) : [0];
    let rowOrder;
    if (afterRowOrder == null) {
      rowOrder = grid.length > 0 ? grid[grid.length - 1].order + 1 : 0;
    } else {
      const idx = grid.findIndex((r4) => r4.order === afterRowOrder);
      const nextRow = grid[idx + 1];
      rowOrder = orderBetween(afterRowOrder, nextRow?.order);
    }
    const ids = [];
    for (let c4 = 0; c4 < colCount; c4++) {
      const id = crypto.randomUUID();
      saveBlock({ id, content: "", pageId: table.pageId, parent: tableId, order: rowOrder, col: colOrders[c4] });
      ids.push(id);
    }
    return ids;
  }
  function insertTableCol(tableId, afterColOrder) {
    const grid = getTableGrid(tableId);
    const table = blockData.value[tableId];
    if (!table) return [];
    let colOrder;
    if (afterColOrder == null) {
      const maxCol = grid.length > 0 ? Math.max(...grid[0].cells.map((c4) => c4.col ?? 0)) : -1;
      colOrder = maxCol + 1;
    } else {
      const allCols = grid.length > 0 ? grid[0].cells.map((c4) => c4.col ?? 0).sort((a4, b3) => a4 - b3) : [];
      const idx = allCols.indexOf(afterColOrder);
      const nextCol = allCols[idx + 1];
      colOrder = orderBetween(afterColOrder, nextCol);
    }
    const ids = [];
    for (const row of grid) {
      const id = crypto.randomUUID();
      saveBlock({ id, content: "", pageId: table.pageId, parent: tableId, order: row.order, col: colOrder });
      ids.push(id);
    }
    return ids;
  }
  function reorderTableRow(tableId, fromRowOrder, targetRowOrder, position) {
    if (fromRowOrder === targetRowOrder) return;
    const grid = getTableGrid(tableId);
    const targetIdx = grid.findIndex((r4) => r4.order === targetRowOrder);
    if (targetIdx < 0) return;
    let newOrder;
    if (position === "before") {
      const prev = grid[targetIdx - 1];
      newOrder = orderBetween(prev?.order, targetRowOrder);
    } else {
      const next = grid[targetIdx + 1];
      newOrder = orderBetween(targetRowOrder, next?.order);
    }
    const cells = Object.values(blockData.value).filter((b3) => b3.parent === tableId && b3.order === fromRowOrder);
    for (const cell of cells) {
      saveBlock({ ...cell, order: newOrder });
    }
  }
  function reorderTableCol(tableId, fromCol, targetCol, position) {
    if (fromCol === targetCol) return;
    const grid = getTableGrid(tableId);
    if (grid.length === 0) return;
    const colOrders = grid[0].cells.map((c4) => c4.col ?? 0);
    const targetIdx = colOrders.indexOf(targetCol);
    if (targetIdx < 0) return;
    let newCol;
    if (position === "before") {
      const prev = colOrders[targetIdx - 1];
      newCol = orderBetween(prev, targetCol);
    } else {
      const next = colOrders[targetIdx + 1];
      newCol = orderBetween(targetCol, next);
    }
    const cells = Object.values(blockData.value).filter((b3) => b3.parent === tableId && (b3.col ?? 0) === fromCol);
    for (const cell of cells) {
      saveBlock({ ...cell, col: newCol });
    }
  }
  function deleteTableRow(tableId, rowOrder) {
    const cells = Object.values(blockData.value).filter((b3) => b3.parent === tableId && b3.order === rowOrder);
    for (const cell of cells) deleteBlock(cell.id);
    const remaining = Object.values(blockData.value).filter((b3) => b3.parent === tableId);
    if (remaining.length === 0) deleteBlock(tableId);
  }
  function deleteTableCol(tableId, colOrder) {
    const cells = Object.values(blockData.value).filter((b3) => b3.parent === tableId && (b3.col ?? 0) === colOrder);
    for (const cell of cells) deleteBlock(cell.id);
    const remaining = Object.values(blockData.value).filter((b3) => b3.parent === tableId);
    if (remaining.length === 0) deleteBlock(tableId);
  }
  function parseMarkdownToItems(text) {
    const lines = text.split("\n");
    if (lines.length === 0) return [];
    const result = [];
    let headingDepth = -1;
    let bulletIndents = [];
    let lastBulletDepth = -1;
    let lastBulletContentCol = 0;
    let afterBlankLine = false;
    for (const line of lines) {
      if (line.trim() === "") {
        afterBlankLine = true;
        continue;
      }
      if (line.trim() === "---") {
        headingDepth = -1;
        bulletIndents = [];
        lastBulletDepth = -1;
        afterBlankLine = false;
        result.push({ content: "---", type: "paragraph", depth: 0 });
        continue;
      }
      if (isTableRow(line.trim())) {
        if (isTableSeparator(line.trim())) continue;
        const cells = line.trim().slice(1, -1).split("|").map((c4) => c4.trim());
        result.push({ content: line.trim(), type: "table-row", cells, depth: headingDepth + 1 });
        afterBlankLine = false;
        continue;
      }
      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        headingDepth = hm[1].length - 1;
        bulletIndents = [];
        lastBulletDepth = -1;
        afterBlankLine = false;
        result.push({ content: line.trim(), type: "paragraph", depth: headingDepth });
        continue;
      }
      const bm = line.match(/^(\s*)[-*+]\s+(.*)/);
      if (bm) {
        const indent = bm[1].length;
        if (!bulletIndents.includes(indent)) {
          bulletIndents.push(indent);
          bulletIndents.sort((a4, b3) => a4 - b3);
        }
        const indentRank = bulletIndents.indexOf(indent);
        const depth = headingDepth + 1 + indentRank;
        lastBulletDepth = depth;
        lastBulletContentCol = indent + 2;
        afterBlankLine = false;
        result.push({ content: bm[2], type: "bullet", depth });
        continue;
      }
      if (!afterBlankLine && result.length > 0) {
        result[result.length - 1].content += "\n" + line.trim();
        continue;
      }
      if (lastBulletDepth >= 0) {
        const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (lineIndent >= lastBulletContentCol) {
          result.push({ content: line.trim(), type: "paragraph", depth: lastBulletDepth + 1 });
          afterBlankLine = false;
          continue;
        }
      }
      lastBulletDepth = -1;
      afterBlankLine = false;
      result.push({ content: line.trim(), type: "paragraph", depth: headingDepth + 1 });
    }
    if (result.length === 0) return [];
    const minDepth = Math.min(...result.map((r4) => r4.depth));
    return result.map((r4) => ({
      content: r4.content,
      relativeDepth: r4.depth - minDepth,
      type: r4.type,
      ...r4.cells ? { cells: r4.cells } : {}
    }));
  }
  function insertBlocksAfter(afterId, items) {
    if (items.length === 0) return afterId;
    const anchor = blockData.value[afterId];
    if (!anchor) return afterId;
    const pageId = anchor.pageId;
    const siblings = getSiblings(afterId);
    const anchorIdx = siblings.findIndex((b3) => b3.id === afterId);
    const anchorNextOrder = siblings[anchorIdx + 1]?.order;
    const prevAtDepth = {
      0: { id: afterId, order: anchor.order }
    };
    let lastId = afterId;
    for (let i5 = 0; i5 < items.length; i5++) {
      const item = items[i5];
      if (item.type === "table-row" && item.cells) {
        const rows = [];
        let j3 = i5;
        while (j3 < items.length && items[j3].type === "table-row" && items[j3].cells) {
          rows.push(items[j3].cells);
          j3++;
        }
        const d6 = item.relativeDepth;
        const tableId = crypto.randomUUID();
        if (d6 === 0) {
          const order = orderBetween(prevAtDepth[0].order, anchorNextOrder);
          saveBlock({ id: tableId, content: "", pageId, parent: anchor.parent, order, type: "table" });
          prevAtDepth[0] = { id: tableId, order };
        } else {
          const parentEntry = prevAtDepth[d6 - 1];
          if (!parentEntry) {
            i5 = j3 - 1;
            continue;
          }
          const children = Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === parentEntry.id);
          const order = nextOrder(children);
          saveBlock({ id: tableId, content: "", pageId, parent: parentEntry.id, order, type: "table" });
          prevAtDepth[d6] = { id: tableId, order };
        }
        for (let r4 = 0; r4 < rows.length; r4++) {
          for (let c4 = 0; c4 < rows[r4].length; c4++) {
            const cellId = crypto.randomUUID();
            saveBlock({ id: cellId, content: rows[r4][c4], pageId, parent: tableId, order: r4, col: c4 });
          }
        }
        lastId = tableId;
        i5 = j3 - 1;
        continue;
      }
      const d5 = item.relativeDepth;
      const id = crypto.randomUUID();
      const type = item.type ?? "bullet";
      if (d5 === 0) {
        const order = orderBetween(prevAtDepth[0].order, anchorNextOrder);
        saveBlock({ id, content: item.content, pageId, parent: anchor.parent, order, type });
        prevAtDepth[0] = { id, order };
      } else {
        const parentEntry = prevAtDepth[d5 - 1];
        if (!parentEntry) continue;
        const children = Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === parentEntry.id);
        const order = nextOrder(children);
        saveBlock({ id, content: item.content, pageId, parent: parentEntry.id, order, type });
        prevAtDepth[d5] = { id, order };
      }
      for (const k4 in prevAtDepth) if (Number(k4) > d5) delete prevAtDepth[Number(k4)];
      lastId = id;
    }
    maybeRebalance(pageId, anchor.parent);
    return lastId;
  }
  function exportPage(pageId) {
    const flat = flattenTree(buildTree(pageId));
    let headingDepth = 0;
    const isStructural = (c4) => /^#{1,6} /.test(c4) || c4 === "---";
    const tableCellIds = /* @__PURE__ */ new Set();
    const lines = [];
    let prevKind = null;
    let maxBulletDepth = -1;
    for (let i5 = 0; i5 < flat.length; i5++) {
      const b3 = flat[i5];
      if (tableCellIds.has(b3.id)) continue;
      if (b3.type === "table") {
        if (prevKind && prevKind !== "structural") lines.push("");
        const grid = getTableGrid(b3.id);
        for (const cell of grid.flatMap((r4) => r4.cells)) tableCellIds.add(cell.id);
        for (let r4 = 0; r4 < grid.length; r4++) {
          const row = grid[r4];
          lines.push("| " + row.cells.map((c4) => c4.content).join(" | ") + " |");
          if (r4 === 0) {
            lines.push("| " + row.cells.map(() => "---").join(" | ") + " |");
          }
        }
        prevKind = "table";
        maxBulletDepth = -1;
        continue;
      }
      if (isStructural(b3.content)) {
        if (lines.length > 0) lines.push("");
        headingDepth = b3.depth + 1;
        lines.push(b3.content);
        const next = flat[i5 + 1];
        if (next && !tableCellIds.has(next.id) && !isStructural(next.content)) {
          lines.push("");
        }
        prevKind = "structural";
        maxBulletDepth = -1;
        continue;
      }
      if (b3.type === "paragraph") {
        if (b3.content === "") {
          if (prevKind) lines.push("");
          prevKind = null;
          continue;
        }
        if (prevKind === "bullet" || prevKind === "paragraph" || prevKind === "table") {
          lines.push("");
        }
        const indent = "  ".repeat(Math.max(0, b3.depth - headingDepth));
        for (const cl of b3.content.split("\n")) {
          lines.push(`${indent}${cl}`);
        }
        prevKind = "paragraph";
        maxBulletDepth = -1;
      } else {
        if (prevKind === "paragraph" || prevKind === "table") {
          lines.push("");
        }
        const rawDepth = b3.depth - headingDepth;
        const bulletDepth = Math.min(rawDepth, maxBulletDepth + 1);
        maxBulletDepth = bulletDepth;
        const prefix = "  ".repeat(Math.max(0, bulletDepth));
        const contentLines = b3.content.split("\n");
        lines.push(`${prefix}- ${contentLines[0]}`);
        for (let j3 = 1; j3 < contentLines.length; j3++) {
          lines.push(`${prefix}  ${contentLines[j3]}`);
        }
        prevKind = "bullet";
      }
    }
    return lines.join("\n");
  }
  function exportAllPages() {
    return pageList.value.map((page) => {
      const folder = page.folder === "journals" ? "journals" : "pages";
      const filename = `${page.slug}.md`;
      return { path: `${folder}/${filename}`, content: exportPage(page.id) };
    });
  }
  function importAllPages(files) {
    for (const file of files) {
      const parts = file.path.split("/");
      const basename = parts[parts.length - 1].replace(/\.md$/, "");
      const folder = parts.length > 1 && parts[0] === "journals" ? "journals" : void 0;
      const pageId = getOrCreatePage(basename, folder);
      importPage(pageId, file.content);
    }
  }
  function importPage(pageId, markdown) {
    Object.values(blockData.value).filter((b3) => b3.pageId === pageId && b3.parent === null).forEach((b3) => deleteBlock(b3.id));
    const items = parseMarkdownToItems(markdown);
    const lastIdAtDepth = [];
    const orderAtDepth = [];
    for (let i5 = 0; i5 < items.length; i5++) {
      const { content, relativeDepth: depth, type, cells } = items[i5];
      if (type === "table-row" && cells) {
        const rows = [];
        let j3 = i5;
        while (j3 < items.length && items[j3].type === "table-row" && items[j3].cells) {
          rows.push(items[j3].cells);
          j3++;
        }
        const parent2 = depth > 0 ? lastIdAtDepth[depth - 1] ?? null : null;
        if (orderAtDepth[depth] === void 0) orderAtDepth[depth] = 0;
        const tableId = crypto.randomUUID();
        saveBlock({ id: tableId, content: "", pageId, parent: parent2, order: orderAtDepth[depth], type: "table" });
        for (let r4 = 0; r4 < rows.length; r4++) {
          for (let c4 = 0; c4 < rows[r4].length; c4++) {
            const cellId = crypto.randomUUID();
            saveBlock({ id: cellId, content: rows[r4][c4], pageId, parent: tableId, order: r4, col: c4 });
          }
        }
        lastIdAtDepth[depth] = tableId;
        lastIdAtDepth.length = depth + 1;
        orderAtDepth[depth]++;
        orderAtDepth.length = depth + 1;
        i5 = j3 - 1;
        continue;
      }
      const parent = depth > 0 ? lastIdAtDepth[depth - 1] ?? null : null;
      if (orderAtDepth[depth] === void 0) orderAtDepth[depth] = 0;
      const id = crypto.randomUUID();
      saveBlock({ id, content, pageId, parent, order: orderAtDepth[depth], type: type ?? "bullet" });
      lastIdAtDepth[depth] = id;
      lastIdAtDepth.length = depth + 1;
      orderAtDepth[depth]++;
      orderAtDepth.length = depth + 1;
    }
    validateTree(pageId);
  }
  function isTableSeparator(text) {
    return /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(text.trim());
  }
  function isTableRow(text) {
    const t4 = text.trim();
    return t4.startsWith("|") && t4.endsWith("|") && t4.length > 2;
  }
  function parseTableCells(text) {
    if (!isTableRow(text) || isTableSeparator(text)) return null;
    return text.trim().slice(1, -1).split("|").map((c4) => c4.trim());
  }
  function renderContent(text) {
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const codes = [];
    html = html.replace(/`([^`]+)`/g, (_4, code) => {
      codes.push(code);
      return `\0C${codes.length - 1}\0`;
    });
    html = html.replace(
      /^\[([ xX])\] /,
      (_4, state) => `<span class="md-checkbox${state !== " " ? " checked" : ""}"></span> `
    );
    html = html.replace(/(^|\s)#\[\[([^\]]+)\]\]/g, '$1<span class="tag" data-page="$2">#$2</span>');
    html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="wiki-link" data-page="$1">$1</span>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="hyperlink" href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/(^|\s)#(\w[\w\-/]*)(?=\s|$)/g, '$1<span class="tag" data-page="$2">#$2</span>');
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
    html = html.replace(/==(.+?)==/g, "<mark>$1</mark>");
    const tags = [];
    html = html.replace(/<[^>]+>/g, (tag) => {
      tags.push(tag);
      return `\0T${tags.length - 1}\0`;
    });
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a class="hyperlink" href="$2" target="_blank" rel="noopener">$2</a>');
    html = html.replace(/\x00T(\d+)\x00/g, (_4, i5) => tags[parseInt(i5)]);
    html = html.replace(/\x00C(\d+)\x00/g, (_4, i5) => `<code>${codes[parseInt(i5)]}</code>`);
    return html;
  }
  function toggleCheckbox(content) {
    if (/^\[ \] /.test(content)) return content.replace(/^\[ \] /, "[x] ");
    if (/^\[[xX]\] /.test(content)) return content.replace(/^\[[xX]\] /, "[ ] ");
    return content;
  }
  function parseHeading(content) {
    const m4 = content.match(/^(#{1,6}) (.+)/);
    if (!m4) return { level: null, text: content };
    return { level: m4[1].length, text: m4[2] };
  }
  var TODO_KEYWORDS = ["TODO", "DOING", "NOW", "LATER", "WAIT", "DONE", "CANCELLED"];
  var TODO_REGEX = new RegExp(`^(${TODO_KEYWORDS.join("|")}) `);
  function parseTodoStatus(content) {
    const match = content.match(TODO_REGEX);
    if (!match) return { status: null, text: content };
    const raw = match[1].toLowerCase();
    const status = raw === "now" ? "doing" : raw;
    return { status, text: content.slice(match[0].length) };
  }
  function cycleTodoStatus(content) {
    const { status, text } = parseTodoStatus(content);
    const next = {
      todo: "DOING",
      doing: "DONE",
      done: "CANCELLED",
      cancelled: "",
      later: "DOING",
      wait: "DOING"
    };
    if (!status) return `TODO ${content}`;
    const prefix = next[status] ?? "";
    return prefix ? `${prefix} ${text}` : text;
  }
  function getBacklinks(pageId) {
    const page = pageData.value[pageId];
    if (!page) return [];
    const wikiPattern = `[[${page.title}]]`;
    const multiWordTag = `#[[${page.title}]]`;
    const refBlocks = Object.values(blockData.value).filter((b3) => b3.pageId !== pageId && (b3.content.includes(wikiPattern) || b3.content.includes(multiWordTag) || /^\w[\w\-/]*$/.test(page.title) && new RegExp(`(^|\\s)#${escapeRegex(page.title)}(?=\\s|$)`).test(b3.content)));
    return refBlocks.map((block) => {
      const allBlocks = Object.values(blockData.value).filter((b3) => b3.pageId === block.pageId);
      const childTree = buildSubtree(allBlocks, block.id);
      const children = flattenTree(childTree, 1);
      return { block, children };
    });
  }
  function getTagCounts() {
    const exact = /* @__PURE__ */ new Map();
    const multiWordRe = /(^|\s)#\[\[([^\]]+)\]\]/g;
    const singleWordRe = /(^|\s)#(\w[\w\-/]*)(?=\s|$)/g;
    for (const block of Object.values(blockData.value)) {
      let m4;
      multiWordRe.lastIndex = 0;
      while (m4 = multiWordRe.exec(block.content)) {
        exact.set(m4[2], (exact.get(m4[2]) ?? 0) + 1);
      }
      singleWordRe.lastIndex = 0;
      while (m4 = singleWordRe.exec(block.content)) {
        exact.set(m4[2], (exact.get(m4[2]) ?? 0) + 1);
      }
    }
    const merged = /* @__PURE__ */ new Map();
    for (const [tag, count] of exact) {
      const key = tag.toLowerCase();
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, { tag, count });
      } else {
        prev.count += count;
        if (count > (exact.get(prev.tag) ?? 0)) prev.tag = tag;
      }
    }
    return [...merged.values()].sort((a4, b3) => b3.count - a4.count);
  }
  function todaySlug() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  function isJournalSlug(slug) {
    return /^\d{4}-\d{2}-\d{2}$/.test(slug);
  }
  function formatJournalTitle(slug) {
    const d5 = /* @__PURE__ */ new Date(slug + "T00:00:00");
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    return `${DAYS[d5.getDay()]}, ${MONTHS[d5.getMonth()]} ${d5.getDate()}, ${d5.getFullYear()}`;
  }
  function getJournalPages() {
    return Object.values(pageData.value).filter((p5) => p5.folder === "journals").sort((a4, b3) => b3.title.localeCompare(a4.title));
  }
  function isJournalPage(pageId) {
    return pageData.value[pageId]?.folder === "journals";
  }
  function pageTitle(pageId) {
    const page = pageData.value[pageId];
    if (!page) return pageId;
    return isJournalSlug(page.title) ? formatJournalTitle(page.title) : page.title;
  }

  // src/tar.ts
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  function tarHeader(path, size) {
    const header = new Uint8Array(512);
    header.set(enc.encode(path.slice(0, 100)));
    header.set(enc.encode("0000644\0"), 100);
    header.set(enc.encode("0000000\0"), 108);
    header.set(enc.encode("0000000\0"), 116);
    header.set(enc.encode(size.toString(8).padStart(11, "0") + "\0"), 124);
    header.set(enc.encode("00000000000\0"), 136);
    header[156] = 48;
    header.set(enc.encode("ustar\0"), 257);
    header.set(enc.encode("00"), 263);
    header.set(enc.encode("        "), 148);
    let sum = 0;
    for (let i5 = 0; i5 < 512; i5++) sum += header[i5];
    header.set(enc.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
    return header;
  }
  function buildTar(files) {
    const parts = [];
    for (const file of files) {
      const data = enc.encode(file.content);
      parts.push(tarHeader(file.path, data.length));
      parts.push(data);
      const remainder = data.length % 512;
      if (remainder > 0) parts.push(new Uint8Array(512 - remainder));
    }
    parts.push(new Uint8Array(1024));
    return new Blob(parts, { type: "application/x-tar" });
  }
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      if (header.every((b3) => b3 === 0)) break;
      const nameEnd = header.indexOf(0);
      const path = dec.decode(header.subarray(0, nameEnd > 0 && nameEnd < 100 ? nameEnd : 100));
      const sizeStr = dec.decode(header.subarray(124, 136)).replace(/\0/g, "").trim();
      const size = parseInt(sizeStr, 8) || 0;
      const type = header[156];
      offset += 512;
      if ((type === 48 || type === 0) && size > 0) {
        const content = dec.decode(bytes.subarray(offset, offset + size));
        files.push({ path, content });
      }
      offset += Math.ceil(size / 512) * 512;
    }
    return files;
  }

  // node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js
  var f4 = 0;
  var i4 = Array.isArray;
  function u4(e4, t4, n3, o4, i5, u5) {
    t4 || (t4 = {});
    var a4, c4, p5 = t4;
    if ("ref" in p5) for (c4 in p5 = {}, t4) "ref" == c4 ? a4 = t4[c4] : p5[c4] = t4[c4];
    var l5 = { type: e4, props: p5, key: n3, ref: a4, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f4, __i: -1, __u: 0, __source: i5, __self: u5 };
    if ("function" == typeof e4 && (a4 = e4.defaultProps)) for (c4 in a4) void 0 === p5[c4] && (p5[c4] = a4[c4]);
    return l.vnode && l.vnode(l5), l5;
  }

  // src/Icons.tsx
  var props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" };
  var IconCopy = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }),
    /* @__PURE__ */ u4("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
  ] });
  var IconDownload = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    /* @__PURE__ */ u4("polyline", { points: "7 10 12 15 17 10" }),
    /* @__PURE__ */ u4("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
  ] });
  var IconUpload = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    /* @__PURE__ */ u4("polyline", { points: "17 8 12 3 7 8" }),
    /* @__PURE__ */ u4("line", { x1: "12", y1: "3", x2: "12", y2: "15" })
  ] });
  var IconChevronRight = () => /* @__PURE__ */ u4("svg", { ...props, children: /* @__PURE__ */ u4("polyline", { points: "9 18 15 12 9 6" }) });
  var IconChevronDown = () => /* @__PURE__ */ u4("svg", { ...props, children: /* @__PURE__ */ u4("polyline", { points: "6 9 12 15 18 9" }) });
  var IconCalendar = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2" }),
    /* @__PURE__ */ u4("line", { x1: "16", y1: "2", x2: "16", y2: "6" }),
    /* @__PURE__ */ u4("line", { x1: "8", y1: "2", x2: "8", y2: "6" }),
    /* @__PURE__ */ u4("line", { x1: "3", y1: "10", x2: "21", y2: "10" })
  ] });
  var IconFile = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ u4("polyline", { points: "14 2 14 8 20 8" })
  ] });
  var IconUndo = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("polyline", { points: "1 4 1 10 7 10" }),
    /* @__PURE__ */ u4("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" })
  ] });
  var IconRedo = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("polyline", { points: "23 4 23 10 17 10" }),
    /* @__PURE__ */ u4("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
  ] });
  var IconCode = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("polyline", { points: "16 18 22 12 16 6" }),
    /* @__PURE__ */ u4("polyline", { points: "8 6 2 12 8 18" })
  ] });
  var IconTree = () => /* @__PURE__ */ u4("svg", { ...props, children: [
    /* @__PURE__ */ u4("path", { d: "M12 3v6" }),
    /* @__PURE__ */ u4("path", { d: "M6 12H4a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" }),
    /* @__PURE__ */ u4("path", { d: "M20 12h-2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" }),
    /* @__PURE__ */ u4("path", { d: "M12 9a3 3 0 0 0-3 3" }),
    /* @__PURE__ */ u4("path", { d: "M12 9a3 3 0 0 1 3 3" }),
    /* @__PURE__ */ u4("circle", { cx: "12", cy: "3", r: "1" })
  ] });

  // src/Sidebar.tsx
  function groupOlderJournals(pages) {
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear().toString();
    const byYear = /* @__PURE__ */ new Map();
    for (const p5 of pages) {
      const year = p5.title.slice(0, 4);
      const monthKey = p5.title.slice(0, 7);
      if (!byYear.has(year)) byYear.set(year, /* @__PURE__ */ new Map());
      const months = byYear.get(year);
      if (!months.has(monthKey)) months.set(monthKey, []);
      months.get(monthKey).push(p5);
    }
    function buildMonthGroups(monthsMap) {
      return [...monthsMap.entries()].sort((a4, b3) => b3[0].localeCompare(a4[0])).map(([key, pages2]) => {
        const [year, month] = key.split("-");
        const monthName = new Date(Number(year), Number(month) - 1).toLocaleString("default", { month: "long" });
        return { label: `${monthName} ${year}`, key, pages: pages2 };
      });
    }
    const currentYearMonths = byYear.has(currentYear) ? buildMonthGroups(byYear.get(currentYear)) : [];
    const pastYears = [...byYear.entries()].filter(([y5]) => y5 !== currentYear).sort((a4, b3) => b3[0].localeCompare(a4[0])).map(([year, monthsMap]) => ({
      year,
      months: buildMonthGroups(monthsMap),
      totalCount: [...monthsMap.values()].reduce((sum, p5) => sum + p5.length, 0)
    }));
    return { currentYearMonths, pastYears };
  }
  function SectionHeader({ title, open, onToggle, count }) {
    return /* @__PURE__ */ u4("h3", { class: "sidebar-section-header", onClick: onToggle, children: [
      /* @__PURE__ */ u4("span", { class: "sidebar-group-arrow", children: open ? /* @__PURE__ */ u4(IconChevronDown, {}) : /* @__PURE__ */ u4(IconChevronRight, {}) }),
      title,
      count != null && count > 0 && /* @__PURE__ */ u4("span", { class: "sidebar-group-count", children: count })
    ] });
  }
  function Sidebar() {
    const pages = pageList.value;
    const currentId = currentPage.value;
    const todayTitle = todaySlug();
    const journals = pages.filter((p5) => p5.folder === "journals");
    const rootPages = pages.filter((p5) => !p5.folder);
    const todayPage = journals.find((p5) => p5.title === todayTitle);
    const pastJournals = journals.filter((p5) => p5.title !== todayTitle);
    const recentJournals = pastJournals.slice(0, 7);
    const olderJournals = pastJournals.slice(7);
    const { currentYearMonths, pastYears } = groupOlderJournals(olderJournals);
    const otherFolders = /* @__PURE__ */ new Map();
    for (const p5 of pages) {
      if (p5.folder && p5.folder !== "journals") {
        if (!otherFolders.has(p5.folder)) otherFolders.set(p5.folder, []);
        otherFolders.get(p5.folder).push(p5);
      }
    }
    const tagCounts = getTagCounts();
    const tarInputRef = A2(null);
    const [dragging, setDragging] = d2(false);
    const [journalOpen, setJournalOpen] = d2(true);
    const [pagesOpen, setPagesOpen] = d2(true);
    const [tagsOpen, setTagsOpen] = d2(false);
    function handleFileDrop(e4) {
      e4.preventDefault();
      setDragging(false);
      const items = Array.from(e4.dataTransfer?.files ?? []);
      const mdFiles = items.filter((f5) => f5.name.endsWith(".md") || f5.name.endsWith(".markdown") || f5.name.endsWith(".txt"));
      if (mdFiles.length === 0) return;
      Promise.all(mdFiles.map((f5) => f5.text().then((content) => ({
        path: `pages/${f5.name}`,
        content
      })))).then((files) => importAllPages(files));
    }
    function handleExportAll() {
      const files = exportAllPages();
      const blob = buildTar(files);
      const url = URL.createObjectURL(blob);
      const a4 = document.createElement("a");
      a4.href = url;
      a4.download = "outliner-export.tar";
      a4.click();
      URL.revokeObjectURL(url);
    }
    function handleImportTar(e4) {
      const file = e4.target.files?.[0];
      if (!file) return;
      file.arrayBuffer().then((buf) => {
        const files = parseTar(buf);
        importAllPages(files);
        e4.target.value = "";
      });
    }
    return /* @__PURE__ */ u4(
      "nav",
      {
        class: `sidebar${dragging ? " drop-active" : ""}`,
        onDragOver: (e4) => {
          e4.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e4) => handleFileDrop(e4),
        children: [
          /* @__PURE__ */ u4("div", { class: "sidebar-section", children: [
            /* @__PURE__ */ u4(SectionHeader, { title: "Journal", open: journalOpen, onToggle: () => setJournalOpen(!journalOpen) }),
            journalOpen && /* @__PURE__ */ u4(k, { children: [
              /* @__PURE__ */ u4(
                "button",
                {
                  class: `sidebar-item sidebar-item-icon ${currentId === todayPage?.id ? "active" : ""}`,
                  onClick: () => navigateTo(todayTitle),
                  children: [
                    /* @__PURE__ */ u4("span", { class: "sidebar-icon", children: /* @__PURE__ */ u4(IconCalendar, {}) }),
                    "Today"
                  ]
                }
              ),
              recentJournals.map((page) => /* @__PURE__ */ u4(
                "button",
                {
                  class: `sidebar-item sidebar-item-icon ${currentId === page.id ? "active" : ""}`,
                  onClick: () => navigateById(page.id),
                  children: [
                    /* @__PURE__ */ u4("span", { class: "sidebar-icon", children: /* @__PURE__ */ u4(IconCalendar, {}) }),
                    pageTitle(page.id)
                  ]
                },
                page.id
              )),
              currentYearMonths.map((group) => /* @__PURE__ */ u4(MonthGroupRow, { label: group.label, pages: group.pages, currentId }, group.key)),
              pastYears.map((yg) => /* @__PURE__ */ u4(YearGroupRow, { group: yg, currentId }, yg.year))
            ] })
          ] }),
          /* @__PURE__ */ u4("div", { class: "sidebar-section", children: [
            /* @__PURE__ */ u4(SectionHeader, { title: "Pages", open: pagesOpen, onToggle: () => setPagesOpen(!pagesOpen), count: rootPages.length }),
            pagesOpen && /* @__PURE__ */ u4(k, { children: [
              rootPages.map((page) => /* @__PURE__ */ u4(PageRow, { page, currentId }, page.id)),
              /* @__PURE__ */ u4("button", { class: "sidebar-add", onClick: () => {
                const title = prompt("Page title:");
                if (!title?.trim()) return;
                navigateTo(title.trim());
              }, children: "+ New Page" })
            ] })
          ] }),
          tagCounts.length > 0 && /* @__PURE__ */ u4("div", { class: "sidebar-section", children: [
            /* @__PURE__ */ u4(SectionHeader, { title: "Tags", open: tagsOpen, onToggle: () => setTagsOpen(!tagsOpen), count: tagCounts.length }),
            tagsOpen && /* @__PURE__ */ u4(TagCloud, { tags: tagCounts })
          ] }),
          [...otherFolders.entries()].map(([folder, folderPages]) => /* @__PURE__ */ u4("div", { class: "sidebar-section", children: [
            /* @__PURE__ */ u4("h3", { children: folder }),
            folderPages.map((page) => /* @__PURE__ */ u4(PageRow, { page, currentId }, page.id))
          ] }, folder)),
          /* @__PURE__ */ u4("div", { class: "sidebar-section sidebar-actions", children: [
            /* @__PURE__ */ u4("button", { class: "sidebar-action", onClick: handleExportAll, title: "Export all pages as .tar", children: [
              /* @__PURE__ */ u4(IconDownload, {}),
              " Export"
            ] }),
            /* @__PURE__ */ u4("button", { class: "sidebar-action", onClick: () => tarInputRef.current?.click(), title: "Import pages from .tar", children: [
              /* @__PURE__ */ u4(IconUpload, {}),
              " Import"
            ] }),
            /* @__PURE__ */ u4("input", { ref: tarInputRef, type: "file", accept: ".tar", style: "display:none", onChange: handleImportTar })
          ] })
        ]
      }
    );
  }
  function TagCloud({ tags }) {
    const maxCount = tags[0]?.count ?? 1;
    return /* @__PURE__ */ u4("div", { class: "tag-cloud", children: tags.map(({ tag, count }) => {
      const t4 = maxCount > 1 ? Math.log(count) / Math.log(maxCount) : 0;
      const scale = 0.75 + 0.35 * t4;
      return /* @__PURE__ */ u4(
        "button",
        {
          class: "tag-cloud-item",
          style: `font-size: ${scale}rem`,
          onClick: () => navigateTo(tag),
          title: `#${tag} (${count})`,
          children: [
            "#",
            tag
          ]
        },
        tag
      );
    }) });
  }
  function MonthGroupRow({ label, pages, currentId }) {
    const hasActive = pages.some((p5) => p5.id === currentId);
    const [open, setOpen] = d2(hasActive);
    return /* @__PURE__ */ u4("div", { class: "sidebar-month-group", children: [
      /* @__PURE__ */ u4("button", { class: "sidebar-item sidebar-group-toggle", onClick: () => setOpen(!open), children: [
        /* @__PURE__ */ u4("span", { class: "sidebar-group-arrow", children: open ? /* @__PURE__ */ u4(IconChevronDown, {}) : /* @__PURE__ */ u4(IconChevronRight, {}) }),
        label,
        /* @__PURE__ */ u4("span", { class: "sidebar-group-count", children: pages.length })
      ] }),
      open && pages.map((page) => /* @__PURE__ */ u4(
        "button",
        {
          class: `sidebar-item sidebar-item-icon sidebar-indent-1 ${currentId === page.id ? "active" : ""}`,
          onClick: () => navigateById(page.id),
          children: [
            /* @__PURE__ */ u4("span", { class: "sidebar-icon", children: /* @__PURE__ */ u4(IconCalendar, {}) }),
            pageTitle(page.id)
          ]
        },
        page.id
      ))
    ] });
  }
  function YearGroupRow({ group, currentId }) {
    const hasActive = group.months.some((m4) => m4.pages.some((p5) => p5.id === currentId));
    const [open, setOpen] = d2(hasActive);
    return /* @__PURE__ */ u4("div", { class: "sidebar-year-group", children: [
      /* @__PURE__ */ u4("button", { class: "sidebar-item sidebar-group-toggle", onClick: () => setOpen(!open), children: [
        /* @__PURE__ */ u4("span", { class: "sidebar-group-arrow", children: open ? /* @__PURE__ */ u4(IconChevronDown, {}) : /* @__PURE__ */ u4(IconChevronRight, {}) }),
        group.year,
        /* @__PURE__ */ u4("span", { class: "sidebar-group-count", children: group.totalCount })
      ] }),
      open && group.months.map((month) => /* @__PURE__ */ u4(MonthInYear, { month, currentId }, month.key))
    ] });
  }
  function MonthInYear({ month, currentId }) {
    const hasActive = month.pages.some((p5) => p5.id === currentId);
    const [open, setOpen] = d2(hasActive);
    const shortLabel = month.label.split(" ")[0];
    return /* @__PURE__ */ u4("div", { children: [
      /* @__PURE__ */ u4("button", { class: "sidebar-item sidebar-group-toggle sidebar-indent-1", onClick: () => setOpen(!open), children: [
        /* @__PURE__ */ u4("span", { class: "sidebar-group-arrow", children: open ? /* @__PURE__ */ u4(IconChevronDown, {}) : /* @__PURE__ */ u4(IconChevronRight, {}) }),
        shortLabel,
        /* @__PURE__ */ u4("span", { class: "sidebar-group-count", children: month.pages.length })
      ] }),
      open && month.pages.map((page) => /* @__PURE__ */ u4(
        "button",
        {
          class: `sidebar-item sidebar-item-icon sidebar-indent-2 ${currentId === page.id ? "active" : ""}`,
          onClick: () => navigateById(page.id),
          children: [
            /* @__PURE__ */ u4("span", { class: "sidebar-icon", children: /* @__PURE__ */ u4(IconCalendar, {}) }),
            pageTitle(page.id)
          ]
        },
        page.id
      ))
    ] });
  }
  function PageRow({ page, currentId }) {
    return /* @__PURE__ */ u4("div", { class: `sidebar-item-row ${currentId === page.id ? "active" : ""}`, children: [
      /* @__PURE__ */ u4("button", { class: "sidebar-item sidebar-item-icon", onClick: () => navigateById(page.id), children: [
        /* @__PURE__ */ u4("span", { class: "sidebar-icon", children: /* @__PURE__ */ u4(IconFile, {}) }),
        page.title
      ] }),
      /* @__PURE__ */ u4(
        "button",
        {
          class: "sidebar-delete",
          onClick: (e4) => {
            e4.stopPropagation();
            if (confirm(`Delete "${page.title}"?`)) deletePage(page.id);
          },
          children: "\xD7"
        }
      )
    ] });
  }

  // src/Editor.tsx
  var dragBlockId = null;
  function clearDropIndicators() {
    document.querySelectorAll(".drop-before,.drop-after,.drop-nested").forEach((el) => {
      el.classList.remove("drop-before", "drop-after", "drop-nested");
    });
  }
  var INDENT_PX = 24;
  var pendingActivation = null;
  function activateBlock(blockId, cursor = "end") {
    pendingActivation = { blockId, cursor };
    activeBlockId.value = blockId;
  }
  function getCursorOffset(el) {
    const sel = window.getSelection();
    if (!sel || !sel.focusNode) return 0;
    if (sel.focusNode === el) {
      let offset = 0;
      for (let i5 = 0; i5 < sel.focusOffset && i5 < el.childNodes.length; i5++) {
        offset += el.childNodes[i5].textContent?.length ?? 0;
      }
      return offset;
    }
    return sel.focusOffset;
  }
  function setCursor(el, position, prefixLen) {
    const textNode = el.firstChild;
    if (!textNode || textNode.nodeType !== 3) return;
    const len = textNode.textContent?.length ?? 0;
    const sel = window.getSelection();
    const range = document.createRange();
    let offset;
    if (typeof position === "number") {
      offset = Math.min(position + prefixLen, len);
    } else if (position === "start") {
      offset = prefixLen;
    } else {
      offset = len;
    }
    range.setStart(textNode, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function getVisualDepth(node) {
    let depth = node.depth;
    let pid = node.parent;
    while (pid) {
      const p5 = blockData.value[pid];
      if (p5 && p5.type === "paragraph" && parseHeading(p5.content).level) depth--;
      pid = p5?.parent ?? null;
    }
    return depth;
  }
  function startBlockDrag(e4, blockId) {
    dragBlockId = blockId;
    e4.dataTransfer.effectAllowed = "move";
    e4.dataTransfer.setData("text/plain", blockId);
    requestAnimationFrame(() => {
      e4.target.closest(".block")?.classList.add("dragging");
    });
  }
  function parseRaw(raw) {
    if (raw.startsWith("- ") || raw.startsWith("* ") || raw.startsWith("+ ")) {
      return { type: "bullet", content: raw.slice(2) };
    }
    return { type: "paragraph", content: raw };
  }
  function editPrefix(type) {
    return type === "paragraph" ? "" : "- ";
  }
  function BlockItem({ node }) {
    const isActive = activeBlockId.value === node.id;
    const ref = A2(null);
    const hasKids = hasChildren(node.id);
    const isHr = node.content === "---";
    const prefix = editPrefix(node.type);
    _(() => {
      if (!isActive || !ref.current) return;
      const el = ref.current;
      el.textContent = prefix + node.content;
      el.focus();
      const cursor = pendingActivation?.blockId === node.id ? pendingActivation.cursor : "end";
      pendingActivation = null;
      setCursor(el, cursor, prefix.length);
    }, [isActive]);
    const collapsed = hasKids && isCollapsed(node.id);
    _(() => {
      if (isActive || !ref.current) return;
      const { status: status2, text: statusText } = parseTodoStatus(node.content);
      const { text } = parseHeading(statusText);
      const marker = status2 ? `<span class="todo-marker ${status2}"></span>` : "";
      ref.current.innerHTML = marker + `<span>${renderContent(text) || "<br>"}</span>`;
      if (collapsed) {
        const el = document.createElement("span");
        el.className = "collapsed-ellipsis";
        el.textContent = "\u2026";
        el.onclick = (e4) => {
          e4.stopPropagation();
          toggleCollapse(node.id);
        };
        ref.current.appendChild(el);
      }
    }, [isActive, node.content, collapsed]);
    function saveFromEditor() {
      const raw = ref.current?.textContent || "";
      const { type, content } = parseRaw(raw);
      const current = blockData.value[node.id];
      if (!current) return;
      const currentType = current.type || "bullet";
      if (content !== current.content || type !== currentType) {
        saveBlock({ ...current, content, type });
      }
    }
    function handleKeyDown(e4) {
      const el = ref.current;
      const raw = el.textContent || "";
      const { type: parsedType, content: parsedContent } = parseRaw(raw);
      if ((e4.metaKey || e4.ctrlKey) && e4.key === "z") {
        e4.preventDefault();
        saveFromEditor();
        if (e4.shiftKey) redo();
        else undo();
        return;
      }
      if (e4.key === "Enter") {
        e4.preventDefault();
        const cells = parseTableCells(parsedContent);
        if (cells && cells.length > 0) {
          beginUndo("create table");
          const tableId = createTable(node.id, [cells]);
          void deleteBlock(node.id);
          const newCellIds = insertTableRow(tableId);
          commitUndo();
          if (newCellIds.length > 0) activateBlock(newCellIds[0], "start");
          return;
        }
        const offset = getCursorOffset(el);
        const rawBefore = raw.slice(0, offset);
        const rawAfter = raw.slice(offset);
        if (rawBefore === "") {
          beginUndo("split block");
          saveBlock({ ...node, content: "", type: "paragraph" });
          const { type: afterType, content: afterContent } = parseRaw(raw);
          const newId2 = createBlockAfter(node.id, afterContent, afterType);
          commitUndo();
          activateBlock(newId2, "start");
          return;
        }
        beginUndo("split block");
        const { type: beforeType, content: beforeContent } = parseRaw(rawBefore);
        el.textContent = rawBefore;
        saveBlock({ ...node, content: beforeContent, type: beforeType });
        const { level: level2 } = parseHeading(beforeContent);
        if (level2) {
          const newId2 = createChildBlock(node.id, rawAfter);
          commitUndo();
          activateBlock(newId2, "start");
          return;
        }
        const newId = createBlockAfter(node.id, rawAfter, beforeType);
        commitUndo();
        activateBlock(newId, "start");
        return;
      }
      if (e4.key === "Backspace") {
        if (getCursorOffset(el) === 0 && raw !== "") {
          e4.preventDefault();
          beginUndo("join blocks");
          saveFromEditor();
          const joined = joinBlockWithPrevious(node.id);
          commitUndo();
          if (joined) activateBlock(joined.prevId, joined.cursorPos);
          return;
        }
        if (raw === "- " || raw === "* " || raw === "+ ") {
          e4.preventDefault();
          el.textContent = "";
          const current = blockData.value[node.id];
          if (current) saveBlock({ ...current, content: "", type: "paragraph" });
          return;
        }
        if (raw === "") {
          e4.preventDefault();
          beginUndo("delete block");
          const joined = joinBlockWithPrevious(node.id);
          if (joined) {
            activateBlock(joined.prevId, joined.cursorPos);
          } else {
            removeBlock(node.id);
          }
          commitUndo();
          return;
        }
        return;
      }
      if (e4.key === "Tab") {
        e4.preventDefault();
        beginUndo(e4.shiftKey ? "outdent" : "indent");
        saveFromEditor();
        if (e4.shiftKey) outdentBlock(node.id);
        else indentBlock(node.id);
        commitUndo();
        return;
      }
      if (e4.key === "ArrowUp") {
        if (getCursorOffset(el) === 0) {
          const flat = flattenTree(buildTree(node.pageId));
          const idx = flat.findIndex((b3) => b3.id === node.id);
          if (idx > 0) {
            e4.preventDefault();
            saveFromEditor();
            activateBlock(flat[idx - 1].id, "end");
          }
        }
        return;
      }
      if (e4.key === "ArrowDown") {
        if (getCursorOffset(el) === raw.length) {
          const flat = flattenTree(buildTree(node.pageId));
          const idx = flat.findIndex((b3) => b3.id === node.id);
          if (idx < flat.length - 1) {
            e4.preventDefault();
            saveFromEditor();
            activateBlock(flat[idx + 1].id, "start");
          }
        }
        return;
      }
    }
    function handleBlur() {
      if (!ref.current) return;
      if (activeBlockId.value === node.id) {
        saveFromEditor();
        activeBlockId.value = null;
      }
    }
    function handlePaste(e4) {
      const text = e4.clipboardData?.getData("text/plain") ?? "";
      if (!text.includes("\n")) return;
      e4.preventDefault();
      const el = ref.current;
      const offset = getCursorOffset(el);
      const raw = el.textContent ?? "";
      const { content: beforeContent } = parseRaw(raw.slice(0, offset));
      const rawAfter = raw.slice(offset);
      const items = parseMarkdownToItems(text);
      if (items.length === 0) return;
      const merged = items.map((item, i5) => ({
        ...item,
        content: (i5 === 0 ? beforeContent : "") + item.content + (i5 === items.length - 1 ? rawAfter : "")
      }));
      beginUndo("paste");
      saveBlock({ ...node, content: merged[0].content });
      if (merged.length === 1) {
        commitUndo();
        activateBlock(node.id, beforeContent.length + items[0].content.length);
        return;
      }
      const lastId = insertBlocksAfter(node.id, merged.slice(1));
      commitUndo();
      const lastContent = merged[merged.length - 1].content;
      activateBlock(lastId, lastContent.length - rawAfter.length);
    }
    function handleClick(e4) {
      if (isActive) return;
      const target = e4.target;
      if (target.classList.contains("wiki-link") || target.classList.contains("tag")) {
        e4.stopPropagation();
        const page = target.dataset.page;
        if (page) navigateTo(page);
        return;
      }
      if (target.classList.contains("hyperlink")) {
        e4.stopPropagation();
        return;
      }
      if (target.classList.contains("md-checkbox")) {
        e4.stopPropagation();
        const current = blockData.value[node.id];
        if (current) saveBlock({ ...current, content: toggleCheckbox(current.content) });
        return;
      }
      if (target.classList.contains("todo-marker")) {
        e4.stopPropagation();
        const current = blockData.value[node.id];
        if (current) saveBlock({ ...current, content: cycleTodoStatus(current.content) });
        return;
      }
      const id = node.id;
      requestAnimationFrame(() => {
        activateBlock(id, "end");
      });
    }
    function handleDragStart(e4) {
      startBlockDrag(e4, node.id);
    }
    function handleDragOver(e4) {
      e4.preventDefault();
      if (!dragBlockId || dragBlockId === node.id) return;
      if (isDescendant(node.id, dragBlockId)) return;
      const dragBlock = blockData.value[dragBlockId];
      if (!dragBlock) return;
      const dragKind = blockKind(dragBlock);
      const targetKind = blockKind(node);
      const canSibling = targetKind !== "heading" || dragKind === "heading";
      const canNest = canAcceptChildren(node);
      const el = e4.currentTarget;
      const rect = el.getBoundingClientRect();
      const y5 = e4.clientY - rect.top;
      const xOffset = e4.clientX - rect.left;
      clearDropIndicators();
      if (y5 < rect.height * 0.25 && canSibling) {
        el.classList.add("drop-before");
      } else {
        const nestThreshold = (node.depth + 1) * INDENT_PX;
        const wantsNest = xOffset >= nestThreshold;
        if (wantsNest && canNest) {
          el.classList.add("drop-nested");
        } else if (canSibling) {
          el.classList.add("drop-after");
        }
      }
    }
    function handleDragLeave(e4) {
      const el = e4.currentTarget;
      const related = e4.relatedTarget;
      if (!related || !el.contains(related)) {
        el.classList.remove("drop-before", "drop-after", "drop-nested");
      }
    }
    function handleDrop(e4) {
      e4.preventDefault();
      const el = e4.currentTarget;
      const position = el.classList.contains("drop-before") ? "before" : el.classList.contains("drop-nested") ? "nested" : "after";
      clearDropIndicators();
      if (dragBlockId && dragBlockId !== node.id) {
        beginUndo("move block");
        moveBlock(dragBlockId, node.id, position);
        commitUndo();
      }
      dragBlockId = null;
    }
    function handleDragEnd() {
      clearDropIndicators();
      document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
      dragBlockId = null;
    }
    const isPara = node.type === "paragraph";
    const { status } = parseTodoStatus(node.content);
    const { level } = parseHeading(node.content);
    const contentClass = [
      "block-content",
      isActive ? "editing" : "",
      !isActive && status === "done" ? "is-done" : "",
      !isActive && status === "cancelled" ? "is-cancelled" : "",
      level ? `heading-${level}` : ""
    ].filter(Boolean).join(" ");
    const visualDepth = getVisualDepth(node);
    return /* @__PURE__ */ u4(
      "div",
      {
        class: "block",
        style: isHr && !isActive ? "--depth: 0" : `--depth: ${visualDepth}`,
        onDragOver: (e4) => handleDragOver(e4),
        onDragLeave: (e4) => handleDragLeave(e4),
        onDrop: (e4) => handleDrop(e4),
        onDragEnd: handleDragEnd,
        children: [
          /* @__PURE__ */ u4(
            "span",
            {
              class: `gutter${hasKids ? " has-children" : ""}${isCollapsed(node.id) ? " collapsed" : ""}`,
              draggable: true,
              onClick: (e4) => {
                if (hasKids) {
                  e4.stopPropagation();
                  toggleCollapse(node.id);
                }
              },
              onDragStart: (e4) => handleDragStart(e4)
            }
          ),
          !isPara && /* @__PURE__ */ u4("span", { class: "bullet" }),
          isHr && !isActive ? /* @__PURE__ */ u4("hr", { onClick: handleClick }) : /* @__PURE__ */ u4(
            "div",
            {
              ref,
              class: contentClass,
              contentEditable: isActive,
              onKeyDown: handleKeyDown,
              onBlur: handleBlur,
              onClick: handleClick,
              onPaste: (e4) => handlePaste(e4)
            }
          )
        ]
      }
    );
  }
  var dragRowState = null;
  var dragColState = null;
  function ContextMenu({ menu, onClose }) {
    const ref = A2(null);
    y2(() => {
      if (!menu) return;
      const handler = (e4) => {
        if (ref.current && !ref.current.contains(e4.target)) onClose();
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [menu]);
    if (!menu) return null;
    return /* @__PURE__ */ u4("div", { ref, class: "context-menu", style: `left:${menu.x}px;top:${menu.y}px`, children: menu.items.map((item) => /* @__PURE__ */ u4(
      "button",
      {
        class: "context-menu-item",
        onClick: () => {
          item.action();
          onClose();
        },
        children: item.label
      },
      item.label
    )) });
  }
  function TableBlock({ node }) {
    const grid = getTableGrid(node.id);
    if (grid.length === 0) return null;
    const colOrders = grid[0].cells.map((c4) => c4.col ?? 0);
    const [menu, setMenu] = d2(null);
    function onRowContext(e4, rowOrder) {
      e4.preventDefault();
      setMenu({
        x: e4.clientX,
        y: e4.clientY,
        items: [
          { label: "Insert row above", action: () => {
            const g4 = getTableGrid(node.id);
            const idx = g4.findIndex((r4) => r4.order === rowOrder);
            const prev = g4[idx - 1];
            insertTableRow(node.id, prev ? prev.order : void 0);
            if (!prev) {
              const newGrid = getTableGrid(node.id);
              reorderTableRow(node.id, newGrid[newGrid.length - 1].order, rowOrder, "before");
            }
          } },
          { label: "Insert row below", action: () => insertTableRow(node.id, rowOrder) },
          { label: "Delete row", action: () => deleteTableRow(node.id, rowOrder) }
        ]
      });
    }
    function onColContext(e4, colOrder) {
      e4.preventDefault();
      setMenu({
        x: e4.clientX,
        y: e4.clientY,
        items: [
          { label: "Insert column left", action: () => {
            const g4 = getTableGrid(node.id);
            const cols = g4[0].cells.map((c4) => c4.col ?? 0);
            const idx = cols.indexOf(colOrder);
            const prev = cols[idx - 1];
            insertTableCol(node.id, prev !== void 0 ? prev : void 0);
            if (prev === void 0) {
              const newGrid = getTableGrid(node.id);
              const newCols = newGrid[0].cells.map((c4) => c4.col ?? 0);
              const lastCol = newCols[newCols.length - 1];
              reorderTableCol(node.id, lastCol, colOrder, "before");
            }
          } },
          { label: "Insert column right", action: () => insertTableCol(node.id, colOrder) },
          { label: "Delete column", action: () => deleteTableCol(node.id, colOrder) }
        ]
      });
    }
    function onRowDragStart(rowOrder) {
      dragRowState = { tableId: node.id, rowOrder };
      dragColState = null;
    }
    function onRowDragOver(e4, targetOrder) {
      if (!dragRowState || dragRowState.tableId !== node.id) return;
      if (dragRowState.rowOrder === targetOrder) return;
      e4.preventDefault();
      const tr = e4.currentTarget;
      const rect = tr.getBoundingClientRect();
      const half = (e4.clientY - rect.top) / rect.height;
      tr.classList.remove("drop-row-before", "drop-row-after");
      tr.classList.add(half < 0.5 ? "drop-row-before" : "drop-row-after");
    }
    function onRowDragLeave(e4) {
      e4.currentTarget.classList.remove("drop-row-before", "drop-row-after");
    }
    function onRowDrop(e4, targetOrder) {
      e4.preventDefault();
      e4.currentTarget.classList.remove("drop-row-before", "drop-row-after");
      if (!dragRowState || dragRowState.tableId !== node.id) return;
      const rect = e4.currentTarget.getBoundingClientRect();
      const half = (e4.clientY - rect.top) / rect.height;
      reorderTableRow(node.id, dragRowState.rowOrder, targetOrder, half < 0.5 ? "before" : "after");
      dragRowState = null;
    }
    function onColDragStart(colOrder) {
      dragColState = { tableId: node.id, colOrder };
      dragRowState = null;
    }
    function onColDragOver(e4, targetCol) {
      if (!dragColState || dragColState.tableId !== node.id) return;
      if (dragColState.colOrder === targetCol) return;
      e4.preventDefault();
      const td = e4.currentTarget;
      const rect = td.getBoundingClientRect();
      const half = (e4.clientX - rect.left) / rect.width;
      td.classList.remove("drop-col-before", "drop-col-after");
      td.classList.add(half < 0.5 ? "drop-col-before" : "drop-col-after");
    }
    function onColDragLeave(e4) {
      e4.currentTarget.classList.remove("drop-col-before", "drop-col-after");
    }
    function onColDrop(e4, targetCol) {
      e4.preventDefault();
      e4.currentTarget.classList.remove("drop-col-before", "drop-col-after");
      if (!dragColState || dragColState.tableId !== node.id) return;
      const rect = e4.currentTarget.getBoundingClientRect();
      const half = (e4.clientX - rect.left) / rect.width;
      reorderTableCol(node.id, dragColState.colOrder, targetCol, half < 0.5 ? "before" : "after");
      dragColState = null;
    }
    function onDragEnd() {
      dragRowState = null;
      dragColState = null;
      dragBlockId = null;
      document.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    }
    const colCount = colOrders.length;
    return /* @__PURE__ */ u4("div", { class: "block table-block", style: `--depth: ${getVisualDepth(node)}`, onDragEnd, children: [
      /* @__PURE__ */ u4(
        "span",
        {
          class: "gutter table-gutter",
          draggable: true,
          tabIndex: 0,
          onClick: () => {
            activeBlockId.value = node.id;
          },
          onKeyDown: (e4) => {
            const ke = e4;
            if (ke.key === "Backspace" || ke.key === "Delete") {
              ke.preventDefault();
              beginUndo("delete table");
              void deleteBlock(node.id);
              commitUndo();
              activeBlockId.value = null;
            }
          },
          onDragStart: (e4) => startBlockDrag(e4, node.id)
        }
      ),
      /* @__PURE__ */ u4("div", { class: "table-grid", style: `grid-template-columns: repeat(${colCount}, 1fr)`, children: grid.map(
        (row, ri) => row.cells.map((cell, ci) => {
          const colOrder = cell.col ?? 0;
          return /* @__PURE__ */ u4(
            "div",
            {
              class: `table-cell${ri === 0 ? " table-header-cell" : ""}`,
              onClick: () => {
                if (activeBlockId.value !== cell.id) activeBlockId.value = cell.id;
              },
              onDragOver: (e4) => {
                onRowDragOver(e4, row.order);
                onColDragOver(e4, colOrder);
              },
              onDragLeave: (e4) => {
                onRowDragLeave(e4);
                onColDragLeave(e4);
              },
              onDrop: (e4) => {
                onRowDrop(e4, row.order);
                onColDrop(e4, colOrder);
              },
              children: [
                ci === 0 && /* @__PURE__ */ u4(
                  "span",
                  {
                    class: "row-handle",
                    draggable: true,
                    onDragStart: () => onRowDragStart(row.order),
                    onContextMenu: (e4) => onRowContext(e4, row.order),
                    children: "\u283F"
                  }
                ),
                ri === 0 && /* @__PURE__ */ u4(
                  "span",
                  {
                    class: "col-handle",
                    draggable: true,
                    onDragStart: () => onColDragStart(colOrder),
                    onContextMenu: (e4) => onColContext(e4, colOrder),
                    children: "\u22EF"
                  }
                ),
                activeBlockId.value === cell.id ? /* @__PURE__ */ u4(CellEditor, { cell }) : /* @__PURE__ */ u4("span", { dangerouslySetInnerHTML: { __html: renderContent(cell.content) || "&nbsp;" } })
              ]
            },
            cell.id
          );
        })
      ) }),
      /* @__PURE__ */ u4("div", { class: "table-add-col", onClick: () => insertTableCol(node.id), title: "Add column", children: "+" }),
      /* @__PURE__ */ u4(ContextMenu, { menu, onClose: () => setMenu(null) })
    ] });
  }
  function CellEditor({ cell }) {
    const ref = A2(null);
    y2(() => {
      const el = ref.current;
      if (!el) return;
      el.textContent = cell.content;
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      if (el.childNodes.length > 0) {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }, [cell.id]);
    function handleBlur() {
      if (!ref.current) return;
      const content = ref.current.textContent || "";
      if (content !== cell.content) saveBlock({ ...cell, content });
      if (activeBlockId.value === cell.id) activeBlockId.value = null;
    }
    function flushContent() {
      const el = ref.current;
      const content = el.textContent || "";
      if (content !== cell.content) saveBlock({ ...cell, content });
    }
    function handleKeyDown(e4) {
      if (e4.key === "Tab") {
        e4.preventDefault();
        flushContent();
        const grid = getTableGrid(cell.parent);
        const allCells = grid.flatMap((r4) => r4.cells);
        const idx = allCells.findIndex((c4) => c4.id === cell.id);
        const next = e4.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
        if (next) {
          activeBlockId.value = next.id;
        } else if (!e4.shiftKey) {
          const newCellIds = insertTableRow(cell.parent);
          if (newCellIds.length > 0) activeBlockId.value = newCellIds[0];
        }
        return;
      }
      if (e4.key === "Enter") {
        e4.preventDefault();
        flushContent();
        const grid = getTableGrid(cell.parent);
        const rowIdx = grid.findIndex((r4) => r4.cells.some((c4) => c4.id === cell.id));
        const colIdx = grid[rowIdx].cells.findIndex((c4) => c4.id === cell.id);
        const nextRow = grid[rowIdx + 1];
        if (nextRow && nextRow.cells[colIdx]) {
          activeBlockId.value = nextRow.cells[colIdx].id;
        } else {
          const newCellIds = insertTableRow(cell.parent, grid[rowIdx].order);
          if (newCellIds[colIdx]) activeBlockId.value = newCellIds[colIdx];
        }
        return;
      }
      if (e4.key === "Escape") {
        e4.preventDefault();
        activeBlockId.value = null;
        return;
      }
    }
    return /* @__PURE__ */ u4(
      "div",
      {
        ref,
        class: "cell-editor",
        contentEditable: true,
        onKeyDown: handleKeyDown,
        onBlur: handleBlur
      }
    );
  }
  function renderBlockList(flat) {
    const cellIds = /* @__PURE__ */ new Set();
    for (const node of flat) {
      if (node.type === "table") {
        const grid = getTableGrid(node.id);
        for (const row of grid) for (const cell of row.cells) cellIds.add(cell.id);
      }
    }
    const elements = [];
    for (const node of flat) {
      if (cellIds.has(node.id)) continue;
      if (node.type === "table") {
        elements.push(/* @__PURE__ */ u4(TableBlock, { node }, node.id));
      } else {
        elements.push(/* @__PURE__ */ u4(BlockItem, { node }, node.id));
      }
    }
    return elements;
  }
  var JOURNAL_BATCH = 15;
  function Editor() {
    const pageId = currentPage.value;
    if (!pageId) {
      return /* @__PURE__ */ u4("div", { class: "editor empty", children: /* @__PURE__ */ u4("p", { children: "Select a page or start with today's journal." }) });
    }
    if (isJournalPage(pageId)) {
      return /* @__PURE__ */ u4(JournalView, { startPageId: pageId }, pageId);
    }
    return /* @__PURE__ */ u4(SinglePageView, { pageId });
  }
  function PageSection({ pageId, titleClickable }) {
    const tree = buildTree(pageId);
    const flat = flattenTree(tree);
    const backlinks = getBacklinks(pageId);
    const [debugPanel, setDebugPanel] = d2("off");
    function togglePanel(panel) {
      setDebugPanel((prev) => prev === panel ? "off" : panel);
    }
    function handleCopyMarkdown() {
      const md = exportPage(pageId);
      navigator.clipboard.writeText(md);
    }
    function handleDownloadMarkdown() {
      const md = exportPage(pageId);
      const title = pageTitle(pageId);
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a4 = document.createElement("a");
      a4.href = url;
      a4.download = `${title}.md`;
      a4.click();
      URL.revokeObjectURL(url);
    }
    return /* @__PURE__ */ u4("div", { class: `page-section ${debugPanel !== "off" ? "with-debug" : ""}`, children: [
      /* @__PURE__ */ u4("div", { class: "page-section-main", children: [
        /* @__PURE__ */ u4("div", { class: "page-toolbar", children: [
          /* @__PURE__ */ u4("button", { class: "toolbar-btn", disabled: !canUndo(), onClick: () => undo(), title: "Undo (\u2318Z)", children: /* @__PURE__ */ u4(IconUndo, {}) }),
          /* @__PURE__ */ u4("button", { class: "toolbar-btn", disabled: !canRedo(), onClick: () => redo(), title: "Redo (\u2318\u21E7Z)", children: /* @__PURE__ */ u4(IconRedo, {}) }),
          /* @__PURE__ */ u4("div", { class: "toolbar-sep" }),
          /* @__PURE__ */ u4("button", { class: `toolbar-btn${debugPanel === "markdown" ? " active" : ""}`, onClick: () => togglePanel("markdown"), title: "Debug Markdown", children: /* @__PURE__ */ u4(IconCode, {}) }),
          /* @__PURE__ */ u4("button", { class: `toolbar-btn${debugPanel === "ast" ? " active" : ""}`, onClick: () => togglePanel("ast"), title: "Debug AST", children: /* @__PURE__ */ u4(IconTree, {}) }),
          /* @__PURE__ */ u4("div", { class: "toolbar-sep" }),
          /* @__PURE__ */ u4("button", { class: "toolbar-btn", onClick: handleCopyMarkdown, title: "Copy as Markdown", children: /* @__PURE__ */ u4(IconCopy, {}) }),
          /* @__PURE__ */ u4("button", { class: "toolbar-btn", onClick: handleDownloadMarkdown, title: "Download page as Markdown", children: /* @__PURE__ */ u4(IconDownload, {}) })
        ] }),
        /* @__PURE__ */ u4(
          "h1",
          {
            class: `page-title${titleClickable ? " journal-day-title" : ""}`,
            onClick: titleClickable ? () => navigateById(pageId) : void 0,
            children: pageTitle(pageId)
          }
        ),
        /* @__PURE__ */ u4("div", { class: "block-tree", children: [
          renderBlockList(flat),
          /* @__PURE__ */ u4(
            "div",
            {
              class: "block-tree-tail",
              onClick: () => {
                if (flat.length === 0) return;
                let parentId = null;
                for (let i5 = flat.length - 1; i5 >= 0; i5--) {
                  if (flat[i5].depth === 0 && blockKind(blockData.value[flat[i5].id]) === "heading") {
                    parentId = flat[i5].id;
                    break;
                  }
                }
                const siblings = flat.filter((b3) => {
                  const block = blockData.value[b3.id];
                  return block && block.parent === parentId && block.type !== "table";
                });
                const lastSibling = siblings[siblings.length - 1];
                if (lastSibling) {
                  const block = blockData.value[lastSibling.id];
                  if (block && block.content === "") {
                    activateBlock(lastSibling.id, "start");
                    return;
                  }
                }
                const allAtLevel = flat.filter((b3) => blockData.value[b3.id]?.parent === parentId);
                const anchor = allAtLevel[allAtLevel.length - 1];
                if (anchor) {
                  beginUndo("new block");
                  const newId = createBlockAfter(anchor.id, "", "paragraph");
                  commitUndo();
                  activateBlock(newId, "start");
                }
              }
            }
          )
        ] }),
        backlinks.length > 0 && /* @__PURE__ */ u4(BacklinksPanel, { backlinks })
      ] }),
      debugPanel === "markdown" && /* @__PURE__ */ u4(DebugPanel, { header: "Markdown", children: /* @__PURE__ */ u4("pre", { class: "markdown-panel-content", children: exportPage(pageId) }) }),
      debugPanel === "ast" && /* @__PURE__ */ u4(DebugPanel, { header: "AST", children: /* @__PURE__ */ u4(ASTContent, { tree }) })
    ] });
  }
  function SinglePageView({ pageId }) {
    return /* @__PURE__ */ u4("div", { class: "editor", children: /* @__PURE__ */ u4("div", { class: "editor-main", children: /* @__PURE__ */ u4(PageSection, { pageId }) }) });
  }
  function DebugPanel({ header, children }) {
    return /* @__PURE__ */ u4("div", { class: "debug-panel", children: [
      /* @__PURE__ */ u4("div", { class: "debug-panel-header", children: header }),
      children
    ] });
  }
  function ASTContent({ tree }) {
    function renderNode(node, prefix, isLast) {
      const connector = isLast ? "\u2514\u2500 " : "\u251C\u2500 ";
      const childPrefix = prefix + (isLast ? "   " : "\u2502  ");
      const type = node.type === "table" ? "table" : node.type === "paragraph" ? "para" : "bullet";
      const snippet = node.content.length > 30 ? node.content.slice(0, 30) + "\u2026" : node.content;
      const meta = [
        isCollapsed(node.id) ? "collapsed" : ""
      ].filter(Boolean).join(", ");
      return /* @__PURE__ */ u4(k, { children: [
        /* @__PURE__ */ u4("span", { class: "ast-line", children: [
          /* @__PURE__ */ u4("span", { class: "ast-prefix", children: [
            prefix,
            connector
          ] }),
          /* @__PURE__ */ u4("span", { class: `ast-type ast-type-${type}`, children: type }),
          snippet && /* @__PURE__ */ u4("span", { class: "ast-content", children: [
            ' "',
            snippet,
            '"'
          ] }),
          meta && /* @__PURE__ */ u4("span", { class: "ast-meta", children: [
            " [",
            meta,
            "]"
          ] })
        ] }),
        "\n",
        node.children.map(
          (child, i5) => renderNode(child, childPrefix, i5 === node.children.length - 1)
        )
      ] });
    }
    return /* @__PURE__ */ u4("pre", { class: "markdown-panel-content ast-tree", children: [
      /* @__PURE__ */ u4("span", { class: "ast-line", children: /* @__PURE__ */ u4("span", { class: "ast-type ast-type-page", children: "page" }) }),
      "\n",
      tree.map((node, i5) => renderNode(node, "", i5 === tree.length - 1))
    ] });
  }
  function JournalView({ startPageId }) {
    const allJournals = getJournalPages();
    const startIdx = Math.max(allJournals.findIndex((p5) => p5.id === startPageId), 0);
    const [newerCount, setNewerCount] = d2(startIdx > 0 ? JOURNAL_BATCH : 0);
    const [olderCount, setOlderCount] = d2(JOURNAL_BATCH);
    const scrollRef = A2(null);
    const anchorRef = A2(null);
    const prevNewerCount = A2(0);
    const newerStart = Math.max(startIdx - newerCount, 0);
    const olderEnd = Math.min(startIdx + olderCount, allJournals.length);
    const visibleJournals = allJournals.slice(newerStart, olderEnd);
    const hasNewer = newerStart > 0;
    const hasOlder = olderEnd < allJournals.length;
    _(() => {
      if (newerCount > prevNewerCount.current && anchorRef.current && scrollRef.current) {
        anchorRef.current.scrollIntoView({ block: "start" });
      }
      prevNewerCount.current = newerCount;
    }, [newerCount]);
    const onScroll = q2(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (hasOlder && el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
        setOlderCount((c4) => c4 + JOURNAL_BATCH);
      }
      if (hasNewer && el.scrollTop < 400) {
        setNewerCount((c4) => c4 + JOURNAL_BATCH);
      }
    }, [hasNewer, hasOlder]);
    return /* @__PURE__ */ u4("div", { class: "editor", ref: scrollRef, onScroll, children: /* @__PURE__ */ u4("div", { class: "editor-main journal-view", children: visibleJournals.map((page) => /* @__PURE__ */ u4("div", { ref: page.id === startPageId ? anchorRef : void 0, children: /* @__PURE__ */ u4(PageSection, { pageId: page.id, titleClickable: true }) }, page.id)) }) });
  }
  function BacklinksPanel({ backlinks }) {
    return /* @__PURE__ */ u4("div", { class: "backlinks", children: [
      /* @__PURE__ */ u4("h3", { children: "Linked References" }),
      backlinks.map(({ block, children }) => /* @__PURE__ */ u4("div", { class: "backlink", onClick: () => navigateById(block.pageId), children: [
        /* @__PURE__ */ u4("span", { class: "backlink-page", children: pageTitle(block.pageId) }),
        /* @__PURE__ */ u4(
          "span",
          {
            class: "backlink-content",
            dangerouslySetInnerHTML: { __html: renderContent(block.content) }
          }
        ),
        children.length > 0 && /* @__PURE__ */ u4("div", { class: "backlink-children", children: children.map((child) => /* @__PURE__ */ u4(
          "div",
          {
            class: "backlink-child",
            style: `padding-left: ${child.depth * 1}rem`,
            dangerouslySetInnerHTML: { __html: renderContent(child.content) }
          },
          child.id
        )) })
      ] }, block.id))
    ] });
  }

  // src/App.tsx
  function App() {
    return /* @__PURE__ */ u4("div", { class: "app", children: [
      /* @__PURE__ */ u4(Sidebar, {}),
      /* @__PURE__ */ u4(Editor, {})
    ] });
  }
})();
