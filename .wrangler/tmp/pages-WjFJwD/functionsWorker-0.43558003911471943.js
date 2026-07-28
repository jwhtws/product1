var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/photo.js
async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const name = (url.searchParams.get("name") || "").trim();
  if (!name || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return new Response("Invalid photo", { status: 400 });
  if (!context.env.GOOGLE_PLACES_API_KEY) return new Response("API key is not configured", { status: 503 });
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const source = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&skipHttpRedirect=false&key=${encodeURIComponent(context.env.GOOGLE_PLACES_API_KEY)}`;
  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok) return new Response("Photo unavailable", { status: response.status });
  const outgoing = new Response(response.body, response);
  outgoing.headers.set("cache-control", "public, max-age=2592000");
  context.waitUntil(cache.put(cacheKey, outgoing.clone()));
  return outgoing;
}
__name(onRequestGet, "onRequestGet");

// api/restaurant.js
var GOOGLE_TEXT_SEARCH = "https://places.googleapis.com/v1/places:searchText";
var NAVER_LOCAL_SEARCH = "https://openapi.naver.com/v1/search/local.json";
var NAVER_IMAGE_SEARCH = "https://openapi.naver.com/v1/search/image";
var THIRTY_DAYS = 60 * 60 * 24 * 30;
var json = /* @__PURE__ */ __name((data, status = 200, cache = `public, max-age=${THIRTY_DAYS}`) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache }
}), "json");
async function onRequestGet2(context) {
  const url = new URL(context.request.url);
  const name = (url.searchParams.get("name") || "").trim();
  const address = (url.searchParams.get("address") || "").trim();
  if (!name || !address) return json({ error: "name\uACFC address\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." }, 400, "no-store");
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/restaurant?name=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}&cache=v3`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  if (context.env.NAVER_CLIENT_ID && context.env.NAVER_CLIENT_SECRET) {
    const result2 = await fetchNaverPlace(context, name, address);
    if (result2) {
      const outgoing2 = json(result2, 200, result2.photoUrl ? `public, max-age=${THIRTY_DAYS}` : "public, max-age=86400");
      context.waitUntil(cache.put(cacheKey, outgoing2.clone()));
      return outgoing2;
    }
    if (!context.env.GOOGLE_PLACES_API_KEY) return json({ found: false, provider: "naver" }, 404);
  }
  if (!context.env.GOOGLE_PLACES_API_KEY) {
    return json({ error: "NAVER_CLIENT_ID\uC640 NAVER_CLIENT_SECRET\uC774 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }, 503, "no-store");
  }
  const result = await fetchGooglePlace(context, name, address);
  if (!result) return json({ found: false }, 404);
  const outgoing = json(result);
  context.waitUntil(cache.put(cacheKey, outgoing.clone()));
  return outgoing;
}
__name(onRequestGet2, "onRequestGet");
var stripHtml = /* @__PURE__ */ __name((value) => String(value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(), "stripHtml");
var key = /* @__PURE__ */ __name((value) => stripHtml(value).toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, ""), "key");
var addressCore = /* @__PURE__ */ __name((value) => String(value || "").replace(/\s+/g, "").slice(0, 18), "addressCore");
var canonicalAddress = /* @__PURE__ */ __name((value) => {
  const cleaned = String(value || "").normalize("NFKC").split(",")[0].replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (/도$|특별시$|광역시$/.test(tokens[0] || "")) tokens.shift();
  return key(tokens.join(" "));
}, "canonicalAddress");
var sameAddress = /* @__PURE__ */ __name((item, requested) => {
  const requestedKey = canonicalAddress(requested);
  return [item.roadAddress, item.address].filter(Boolean).some((candidate) => {
    const candidateKey = canonicalAddress(candidate);
    return candidateKey === requestedKey || candidateKey.length >= 10 && requestedKey.startsWith(candidateKey) || requestedKey.length >= 10 && candidateKey.startsWith(requestedKey);
  });
}, "sameAddress");
var locationHints = /* @__PURE__ */ __name((value) => String(value || "").normalize("NFKC").split(/[\s,()]+/).map((token) => token.replace(/[^\p{L}\p{N}]/gu, "")).filter((token) => token.length >= 2 && /[시군구읍면동리로길]$/.test(token)).map(key), "locationHints");
var locality = /* @__PURE__ */ __name((value) => {
  const tokens = String(value || "").split(/\s+/).filter(Boolean);
  const end = tokens.slice(0, 4).findLastIndex((token) => /[시군구]$/.test(token));
  return tokens.slice(0, end >= 0 ? end + 1 : 2).join(" ");
}, "locality");
var addressTokens = /* @__PURE__ */ __name((value) => new Set(String(value || "").normalize("NFKC").replace(/[(),]/g, " ").split(/\s+/).map((token) => token.replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean)), "addressTokens");
var addressScore = /* @__PURE__ */ __name((left, right) => {
  const leftTokens = addressTokens(left), rightTokens = addressTokens(right);
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += token.length >= 3 ? 2 : 1;
  return overlap;
}, "addressScore");
async function fetchNaverPlace(context, name, address) {
  const headers = {
    "X-Naver-Client-Id": context.env.NAVER_CLIENT_ID,
    "X-Naver-Client-Secret": context.env.NAVER_CLIENT_SECRET
  };
  const nameKey = key(name);
  const queries = [.../* @__PURE__ */ new Set([`${name} ${locality(address)}`, name])];
  const items = [];
  for (const query of queries) {
    const localUrl = `${NAVER_LOCAL_SEARCH}?query=${encodeURIComponent(query)}&display=5&sort=random`;
    const localResponse = await fetch(localUrl, { headers });
    if (!localResponse.ok) continue;
    const localData = await localResponse.json();
    items.push(...localData.items || []);
    if (items.some((item) => key(item.title) === nameKey && addressScore(item.roadAddress || item.address, address) >= 5)) break;
  }
  const uniqueItems = [...new Map(items.map((item) => [`${key(item.title)}|${key(item.roadAddress || item.address)}`, item])).values()];
  const candidates = uniqueItems.map((item) => {
    const title = stripHtml(item.title);
    const titleKey = key(title);
    const candidateAddress = item.roadAddress || item.address || "";
    let score = titleKey === nameKey ? 100 : titleKey.includes(nameKey) || nameKey.includes(titleKey) ? 70 : 0;
    const overlap = addressScore(candidateAddress, address);
    const exactAddress = sameAddress(item, address);
    if (exactAddress) score += 140;
    else if (addressCore(candidateAddress) === addressCore(address)) score += 100;
    else if (overlap >= 7) score += 80;
    else if (overlap >= 4) score += 45;
    return { item, title, score, overlap, exactAddress };
  }).sort((left, right) => right.score - left.score);
  const match2 = candidates[0];
  const foodCategory = /음식점|한식|중식|일식|양식|분식|카페|디저트|베이커리|술집|치킨|피자|햄버거|육류|고기|해산물|생선|국수|만두|요리/;
  if (!match2 || !match2.exactAddress || !foodCategory.test(match2.item.category || "")) return null;
  const matchedAddress = match2.item.roadAddress || match2.item.address || address;
  const district = matchedAddress.split(/\s+/).slice(0, 3).join(" ");
  const imageQuery = `${match2.title} ${matchedAddress} \uC74C\uC2DD\uC810`;
  const matchedTitleKey = key(match2.title);
  const hints = locationHints(matchedAddress);
  let image = null;
  for (const filter of ["large", "all"]) {
    const imageResponse = await fetch(`${NAVER_IMAGE_SEARCH}?query=${encodeURIComponent(imageQuery)}&display=10&sort=sim&filter=${filter}`, { headers });
    if (!imageResponse.ok) continue;
    const imageData = await imageResponse.json();
    image = (imageData.items || []).find((item) => {
      const titleKey = key(item.title);
      const nameMatches = titleKey.includes(nameKey) || nameKey.includes(titleKey);
      const exactTitleMatches = matchedTitleKey.length >= 3 && titleKey.includes(matchedTitleKey);
      const locationMatches = hints.some((hint) => titleKey.includes(hint));
      return exactTitleMatches || nameMatches && locationMatches;
    }) || null;
    if (image) break;
  }
  return {
    found: true,
    provider: "naver",
    displayName: match2.title,
    formattedAddress: matchedAddress,
    photoUrl: image?.thumbnail || image?.link || null,
    photoSource: image?.link || null,
    photoSourceTitle: stripHtml(image?.title),
    category: match2.item.category,
    naverPlaceUrl: match2.item.link || `https://map.naver.com/p/search/${encodeURIComponent(matchedAddress)}`,
    priceLevel: null,
    priceRange: null,
    hours: [],
    phone: match2.item.telephone || null,
    businessStatus: null,
    dineIn: null,
    goodForGroups: null,
    outdoorSeating: null,
    reservable: null
  };
}
__name(fetchNaverPlace, "fetchNaverPlace");
async function fetchGooglePlace(context, name, address) {
  const response = await fetch(GOOGLE_TEXT_SEARCH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": context.env.GOOGLE_PLACES_API_KEY,
      "x-goog-fieldmask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.photos",
        "places.priceLevel",
        "places.priceRange",
        "places.regularOpeningHours",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.businessStatus",
        "places.dineIn",
        "places.goodForGroups",
        "places.outdoorSeating",
        "places.reservable"
      ].join(",")
    },
    body: JSON.stringify({ textQuery: `${name} ${address}`, languageCode: "ko", regionCode: "KR", maxResultCount: 1 })
  });
  if (!response.ok) return null;
  const data = await response.json();
  const place = data.places?.[0];
  if (!place) return null;
  const photoName = place.photos?.[0]?.name;
  const priceRange = place.priceRange ? [place.priceRange.startPrice?.units, place.priceRange.endPrice?.units].filter(Boolean).map(Number).map((value) => `${value.toLocaleString("ko-KR")}\uC6D0`).join(" ~ ") : null;
  return {
    found: true,
    provider: "google",
    placeId: place.id,
    displayName: place.displayName?.text,
    formattedAddress: place.formattedAddress,
    photoUrl: photoName ? `/api/photo?name=${encodeURIComponent(photoName)}` : null,
    priceLevel: place.priceLevel?.replace("PRICE_LEVEL_", "").toLowerCase(),
    priceRange,
    hours: place.regularOpeningHours?.weekdayDescriptions || [],
    phone: place.nationalPhoneNumber,
    websiteUri: place.websiteUri,
    googleMapsUri: place.googleMapsUri,
    businessStatus: place.businessStatus,
    dineIn: place.dineIn,
    goodForGroups: place.goodForGroups,
    outdoorSeating: place.outdoorSeating,
    reservable: place.reservable
  };
}
__name(fetchGooglePlace, "fetchGooglePlace");

// ../.wrangler/tmp/pages-WjFJwD/functionsRoutes-0.39319085532249654.mjs
var routes = [
  {
    routePath: "/api/photo",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/restaurant",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  }
];

// ../../../home/codespace/.npm/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key2 = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key2++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key2++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key2 = keys[i2 - 1];
      if (key2.modifier === "*" || key2.modifier === "+") {
        params[key2.name] = m[i2].split(key2.prefix + key2.suffix).map(function(value) {
          return decode(value, key2);
        });
      } else {
        params[key2.name] = decode(m[i2], key2);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../home/codespace/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
