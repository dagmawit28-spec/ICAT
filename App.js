import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, Animated, Easing,
  Share, Switch, StyleSheet, AccessibilityInfo, PanResponder, Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Defs, RadialGradient, Stop, LinearGradient as SvgLinear } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Unbounded_600SemiBold, Unbounded_700Bold } from "@expo-google-fonts/unbounded";
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";

/* ============ design tokens ============
   Dark, calm, glassy. The glow behind everything follows your battery:
   coral when low, amber in the middle, mint when charged. */
const C = {
  bg: "#090D12", bg2: "#0F1621", glass: "rgba(255,255,255,0.055)", glassHi: "rgba(255,255,255,0.10)",
  edge: "rgba(255,255,255,0.09)", ink: "#F1F4F6", muted: "#8D99A5", faint: "rgba(241,244,246,0.38)",
  mint: "#6FEFC0", cyan: "#5CC6F2", amber: "#FFB547", coral: "#FF7766", lilac: "#B7A6FF", onAccent: "#06110D",
};
const F = { display: "Unbounded_700Bold", displaySemi: "Unbounded_600SemiBold", body: "Manrope_400Regular", semi: "Manrope_600SemiBold", bold: "Manrope_700Bold", heavy: "Manrope_800ExtraBold" };
const hueFor = (p) => (p == null ? C.lilac : p < 40 ? C.coral : p < 70 ? C.amber : C.mint);
const tap = () => Haptics.selectionAsync().catch(() => {});
const thump = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

/* ============ content ============ */
const KEY = "icat.v1";
const today = () => new Date().toISOString().slice(0, 10);
const FACTORS = [
  { k: "sleep", icon: "moon", name: "Sleep", opts: ["<5h", "5–6h", "7–8h", "9h+"], val: [0.15, 0.55, 1, 0.85], w: 0.32, tip: "Short sleep makes everything feel louder." },
  { k: "food", icon: "restaurant", name: "Food", opts: ["None", "Snacks", "1 meal", "2+"], val: [0.1, 0.4, 0.7, 1], w: 0.24, tip: "An empty tank can feel like anxiety or irritation." },
  { k: "water", icon: "water", name: "Water", opts: ["Barely", "Some", "Plenty"], val: [0.25, 0.65, 1], w: 0.14, tip: "Dehydration shows up as fog and fatigue." },
  { k: "move", icon: "walk", name: "Movement", opts: ["None", "A little", "Workout"], val: [0.35, 0.8, 1], w: 0.12, tip: "Movement spends energy and refills it." },
  { k: "people", icon: "people", name: "Connection", opts: ["Isolated", "Some", "Good time"], val: [0.3, 0.7, 1], w: 0.18, tip: "Other people regulate us too." },
];
const WORDS = {
  hu: ["anxious", "stressed", "angry", "frustrated", "overwhelmed", "scared", "on edge", "jealous"],
  lu: ["sad", "drained", "lonely", "disappointed", "numb", "discouraged", "ashamed", "bored"],
  hp: ["excited", "hyped", "proud", "motivated", "locked in", "happy", "amped", "inspired"],
  lp: ["calm", "content", "relieved", "grateful", "chill", "peaceful", "hopeful", "rested"],
};
const QUAD_NAME = { hu: "Wired & rough", lu: "Heavy & low", hp: "Charged & good", lp: "Easy & good" };
const SITUATIONS = ["School / work", "Someone in my life", "Game / performance", "Rejection or setback", "Money", "My body / health", "Nothing specific", "Rather not say"];
const SIGNALS = ["Heart racing", "Tight chest", "Stomach off", "Tired", "Restless", "Hungry", "Tense jaw", "Nothing I notice"];
const TOOLS = [
  { id: "shift", icon: "swap-horizontal", hue: C.cyan, stage: "Change the situation", name: "Change something", desc: "One small move for the next 10 minutes." },
  { id: "ground", icon: "eye", hue: C.lilac, stage: "Shift attention", name: "5-4-3-2-1", desc: "Bring your attention back to the room." },
  { id: "rethink", icon: "sync", hue: C.amber, stage: "Rethink it", name: "Rethink it", desc: "Find another way to read what happened." },
  { id: "breathe", icon: "leaf", hue: C.mint, stage: "Calm the body", name: "Long exhale", desc: "In 4, out 6. About a minute." },
  { id: "iam", icon: "sparkles", hue: C.coral, stage: "Self-talk", name: "I am…", desc: "A line you can come back to." },
];
const LOCKED = [
  { icon: "heart", name: "Auto battery from Apple Health", desc: "Sleep, heart rate and steps fill in your battery on their own." },
  { icon: "apps", name: "Home screen widget", desc: "Your battery % on your home screen without opening the app." },
  { icon: "pulse", name: "Body check-in nudges", desc: "Heart rate jumps and you're not working out? ICAT asks what's going on. It never guesses the emotion." },
  { icon: "notifications", name: "Morning notification", desc: "Your I am line on your lock screen when you wake up." },
  { icon: "hand-left", name: "Phone break, only when you ask", desc: "Say you want off your phone and ICAT helps you stop. It never locks you out on its own." },
];
const MORNING = ["New day, fresh battery. Charge it up before the world asks for it.", "You don't have to feel ready to start.", "Whatever yesterday was, today's a different situation.", "Feelings are information, not instructions.", "Eat, hydrate, move a little. Your mood is listening."];
const DEFAULT = { onboarded: false, morning: true, lastMorning: "", battery: {}, iam: [], checkins: [], toolsUsed: {} };

function batteryPct(S) {
  const b = S.battery.date === today() ? S.battery : {};
  let sum = 0, wt = 0;
  FACTORS.forEach((f) => { if (b[f.k] != null) { sum += f.val[b[f.k]] * f.w; wt += f.w; } });
  return wt ? Math.round((sum / wt) * 100) : null;
}
function lowestFactor(S) {
  const b = S.battery.date === today() ? S.battery : {};
  let low = null;
  FACTORS.forEach((f) => { if (b[f.k] != null && (!low || f.val[b[f.k]] < low.v)) low = { f, v: f.val[b[f.k]] }; });
  return low && low.v < 0.7 ? low.f : null;
}

/* ============ app shell ============ */
export default function App() {
  const [loaded] = useFonts({ Unbounded_600SemiBold, Unbounded_700Bold, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {loaded ? <Main /> : <View style={{ flex: 1, backgroundColor: C.bg }} />}
    </SafeAreaProvider>
  );
}

function Main() {
  const [S, setS] = useState(null);
  const [tab, setTab] = useState("today");
  const [tool, setTool] = useState(null);
  const [morning, setMorning] = useState(false);
  const [review, setReview] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      let st = { ...DEFAULT };
      try { st = { ...DEFAULT, ...(JSON.parse(raw) || {}) }; } catch (e) {}
      const h = new Date().getHours();
      if (st.onboarded && st.morning && st.lastMorning !== today() && h >= 4 && h < 12) setMorning(true);
      setS(st);
    }).catch(() => setS({ ...DEFAULT }));
  }, []);

  const update = useCallback((fn) => {
    setS((prev) => {
      const next = fn({ ...prev });
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  if (!S) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const pct = batteryPct(S);
  const hue = hueFor(pct);
  const openTool = (id, onDone) => {
    update((st) => ({ ...st, toolsUsed: { ...st.toolsUsed, [id]: (st.toolsUsed[id] || 0) + 1 } }));
    setTool({ id, onDone });
  };
  const openReview = () => setReview(true);
  const ctx = { S, update, openTool, setTab, setMorning, pct, hue, openReview };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop hue={hue} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {!S.onboarded ? <Welcome {...ctx} /> : (
          <>
            <Header pct={pct} hue={hue} onReview={openReview} />
            <View style={{ flex: 1 }}>
              {tab === "today" && <Today {...ctx} />}
              {tab === "checkin" && <CheckIn {...ctx} />}
              {tab === "tools" && <Tools {...ctx} />}
              {tab === "feedback" && <Feedback {...ctx} />}
            </View>
          </>
        )}
      </SafeAreaView>
      {S.onboarded && <TabBar tab={tab} setTab={setTab} />}
      <Modal visible={!!tool} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setTool(null)}>
        {tool && <ToolSheet {...ctx} id={tool.id} onClose={() => { const d = tool.onDone; setTool(null); d && d(); }} />}
      </Modal>
      <Modal visible={morning} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setMorning(false)}>
        <MorningScreen S={S} hue={hue} onClose={() => { setMorning(false); update((st) => ({ ...st, lastMorning: today() })); }} />
      </Modal>
      <Modal visible={review} animationType="slide" transparent onRequestClose={() => setReview(false)}>
        <ReviewSheet S={S} onClose={() => setReview(false)} />
      </Modal>
    </View>
  );
}

/* Soft radial glow in the battery's color, top of screen */
function Backdrop({ hue }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[C.bg2, C.bg, C.bg]} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="70%" style={{ position: "absolute", top: -80 }}>
        <Defs>
          <RadialGradient id="g" cx="50%" cy="35%" r="60%">
            <Stop offset="0" stopColor={hue} stopOpacity="0.30" />
            <Stop offset="0.55" stopColor={hue} stopOpacity="0.07" />
            <Stop offset="1" stopColor={hue} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="35%" r="70%" fill="url(#g)" />
      </Svg>
    </View>
  );
}

/* ============ building blocks ============ */
function FadeIn({ children, style, delay = 0 }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 380, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, []);
  return <Animated.View style={[{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }, style]}>{children}</Animated.View>;
}
function Glass({ children, style }) { return <View style={[s.glass, style]}>{children}</View>; }

function Btn({ label, onPress, ghost, disabled, icon, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (v) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.4 : 1 }, style]}>
      <Pressable disabled={disabled} accessibilityRole="button" onPressIn={() => press(0.96)} onPressOut={() => press(1)}
        onPress={() => { ghost ? tap() : thump(); onPress && onPress(); }}>
        {ghost ? (
          <View style={[s.btn, s.btnGhost]}>{icon && <Ionicons name={icon} size={18} color={C.ink} />}<Text style={s.btnGhostText}>{label}</Text></View>
        ) : (
          <LinearGradient colors={[C.mint, C.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
            {icon && <Ionicons name={icon} size={18} color={C.onAccent} />}<Text style={s.btnText}>{label}</Text>
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}
function Chip({ label, on, onPress, hue = C.mint }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={() => { tap(); onPress(); }}
      style={[s.chip, on && { backgroundColor: hue, borderColor: hue }]}>
      <Text style={[s.chipText, on && { color: C.onAccent, fontFamily: F.bold }]}>{label}</Text>
    </Pressable>
  );
}
function Seg({ opts, value, onPick, hue = C.mint }) {
  return (
    <View style={s.seg}>
      {opts.map((o, i) => (
        <Pressable key={o} onPress={() => { tap(); onPick(i); }} accessibilityRole="button" accessibilityState={{ selected: value === i }}
          style={[s.segBtn, value === i && { backgroundColor: hue }]}>
          <Text style={[s.segText, value === i && { color: C.onAccent, fontFamily: F.bold }]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const Label = ({ children, style }) => <Text style={[s.label, style]}>{children}</Text>;
function Note({ children, hue = C.mint, icon = "information-circle" }) {
  return (
    <View style={[s.note, { borderColor: hue + "55", backgroundColor: hue + "14" }]}>
      <Ionicons name={icon} size={18} color={hue} style={{ marginTop: 2 }} />
      <Text style={[s.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}
const Footer = () => <Text style={s.footer}>Test build, not therapy. In crisis in the US, call or text 988. In danger, call 911.</Text>;
function Steps({ n, i, hue = C.mint }) {
  return <View style={{ flexDirection: "row", gap: 6 }}>{Array.from({ length: n }, (_, j) => <View key={j} style={[s.stepBar, j <= i && { backgroundColor: hue }]} />)}</View>;
}

/* Battery ring */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
function Ring({ pct, size = 220, stroke = 16, hue, children }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: pct ?? 0, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [pct]);
  const offset = a.interpolate({ inputRange: [0, 100], outputRange: [circ, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Defs>
          <SvgLinear id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={hue} stopOpacity="1" />
            <Stop offset="1" stopColor={C.cyan} stopOpacity="0.9" />
          </SvgLinear>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke="url(#ring)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} />
      </Svg>
      {children}
    </View>
  );
}

/* 2D mood pad: x = unpleasant→pleasant, y = low→high energy (core affect) */
function MoodPad({ energy, feel, onChange, setScroll }) {
  const [box, setBox] = useState({ w: 1, h: 1 });
  const boxRef = useRef(box); boxRef.current = box;
  const last = useRef("");
  const handle = (e) => {
    const { locationX, locationY } = e.nativeEvent;
    const b = boxRef.current;
    const f = Math.max(0, Math.min(100, Math.round((locationX / b.w) * 100)));
    const en = Math.max(0, Math.min(100, Math.round((1 - locationY / b.h) * 100)));
    const q = (en >= 50 ? "h" : "l") + (f >= 50 ? "p" : "u");
    if (q !== last.current) { last.current = q; tap(); }
    onChange(en, f);
  };
  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { setScroll && setScroll(false); handle(e); },
    onPanResponderMove: handle,
    onPanResponderRelease: () => setScroll && setScroll(true),
    onPanResponderTerminate: () => setScroll && setScroll(true),
  }), []);
  const q = (energy >= 50 ? "h" : "l") + (feel >= 50 ? "p" : "u");
  return (
    <View>
      <View style={s.pad} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pr.panHandlers}>
        <LinearGradient pointerEvents="none" colors={["#5B2A35", "#2A3348", "#1E5A49"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={["rgba(255,190,90,0.28)", "rgba(9,13,18,0)", "rgba(9,13,18,0.55)"]} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[s.padLine, { left: "50%", top: 0, bottom: 0, width: 1 }]} />
        <View pointerEvents="none" style={[s.padLine, { top: "50%", left: 0, right: 0, height: 1 }]} />
        <Text pointerEvents="none" style={[s.padCorner, { top: 10, left: 12 }]}>WIRED · ROUGH</Text>
        <Text pointerEvents="none" style={[s.padCorner, { top: 10, right: 12 }]}>CHARGED · GOOD</Text>
        <Text pointerEvents="none" style={[s.padCorner, { bottom: 10, left: 12 }]}>HEAVY · LOW</Text>
        <Text pointerEvents="none" style={[s.padCorner, { bottom: 10, right: 12 }]}>EASY · GOOD</Text>
        <View pointerEvents="none" style={[s.padDotHalo, { left: (feel / 100) * box.w - 28, top: (1 - energy / 100) * box.h - 28 }]} />
        <View pointerEvents="none" style={[s.padDot, { left: (feel / 100) * box.w - 13, top: (1 - energy / 100) * box.h - 13 }]} />
      </View>
      <View style={[s.rowBetween, { marginTop: 10 }]}>
        <Text style={s.small}>← Unpleasant · Pleasant →</Text>
        <Text style={[s.small, { color: C.ink, fontFamily: F.bold }]}>{QUAD_NAME[q]}</Text>
      </View>
    </View>
  );
}

/* 1D drag bar for the after-rating */
function FeelBar({ value, onChange, setScroll }) {
  const [w, setW] = useState(1); const wRef = useRef(1); wRef.current = w;
  const handle = (e) => onChange(Math.max(0, Math.min(100, Math.round((e.nativeEvent.locationX / wRef.current) * 100))));
  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { setScroll && setScroll(false); handle(e); }, onPanResponderMove: handle,
    onPanResponderRelease: () => setScroll && setScroll(true), onPanResponderTerminate: () => setScroll && setScroll(true),
  }), []);
  return (
    <View>
      <View style={s.bar} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pr.panHandlers}>
        <LinearGradient pointerEvents="none" colors={["#5B2A35", "#2A3348", "#1E5A49"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[s.padDot, { top: 15, left: (value / 100) * w - 13 }]} />
      </View>
      <View style={[s.rowBetween, { marginTop: 8 }]}><Text style={s.small}>Unpleasant</Text><Text style={s.small}>Pleasant</Text></View>
    </View>
  );
}

/* ============ header + tab bar ============ */
function Header({ pct, hue, onReview }) {
  return (
    <View style={s.header}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <LinearGradient colors={[hue, C.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.logo}><Text style={s.logoText}>i</Text></LinearGradient>
        <Text style={s.wordmark}>ICAT</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={() => { tap(); onReview(); }} style={s.pill} accessibilityRole="button" accessibilityLabel="Review ICAT">
          <Ionicons name="star" size={13} color={C.amber} />
          <Text style={s.pillText}>Review</Text>
        </Pressable>
        <View style={s.pill}>
          <View style={[s.pillDot, { backgroundColor: hue }]} />
          <Text style={s.pillText}>{pct == null ? "—" : `${pct}%`}</Text>
        </View>
      </View>
    </View>
  );
}

/* Send text to Dag: share sheet, or copy on browsers without one */
async function sendText(message) {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ text: message }); return "sent"; } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
    }
    try { await navigator.clipboard.writeText(message); return "copied"; } catch (e) { return "fail"; }
  }
  try { const r = await Share.share({ message }); return r.action === Share.sharedAction ? "sent" : "cancel"; } catch (e) { return "fail"; }
}
const SEND_MSG = { sent: "Sent. Thank you.", copied: "Copied. Paste it in a text to Dag.", fail: "Couldn't open sharing. Screenshot this and send it to Dag.", cancel: "" };

/* Quick review: stars + one line */
function ReviewSheet({ S, onClose }) {
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(0);
  const [why, setWhy] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const labels = ["", "Ass", "Meh", "It's okay", "Good", "Love it"];
  const send = async () => {
    const msg = [`ICAT review${name ? ` from ${name}` : ""}: ${"★".repeat(stars)}${"☆".repeat(5 - stars)} (${stars}/5)`, why ? `"${why}"` : "", `Check-ins so far: ${S.checkins.length}`].filter(Boolean).join("\n");
    const r = await sendText(msg);
    setStatus(SEND_MSG[r]);
    if (r === "sent") { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); setTimeout(onClose, 900); }
  };
  return (
    <View style={s.sheetBack}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close review" />
      <View style={[s.sheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={s.grabber} />
        <View style={s.rowBetween}>
          <Text style={s.hero2}>Rate ICAT</Text>
          <Pressable onPress={onClose} style={s.close} accessibilityLabel="Close"><Ionicons name="close" size={22} color={C.ink} /></Pressable>
        </View>
        <Text style={s.small}>Takes 10 seconds. Goes straight to Dag.</Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, paddingVertical: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} hitSlop={6} onPress={() => { tap(); setStars(n); }} accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}>
              <Ionicons name={n <= stars ? "star" : "star-outline"} size={42} color={n <= stars ? C.amber : C.faint} />
            </Pressable>
          ))}
        </View>
        <Text style={[s.h3, { textAlign: "center", minHeight: 21 }]}>{labels[stars]}</Text>
        <TextInput style={s.input} value={why} onChangeText={setWhy} placeholder="One line on why" placeholderTextColor={C.faint} />
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.faint} />
        <Btn label="Send review" icon="paper-plane" disabled={!stars} onPress={send} />
        {!!status && <Text style={[s.body, { textAlign: "center" }]}>{status}</Text>}
      </View>
    </View>
  );
}
function TabBar({ tab, setTab }) {
  const insets = useSafeAreaInsets();
  const items = [["today", "battery-half", "Battery"], ["checkin", "pulse", "Check in"], ["tools", "grid", "Toolbox"], ["feedback", "chatbubble-ellipses", "Feedback"]];
  return (
    <View style={[s.tabWrap, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <BlurView intensity={50} tint="dark" style={s.tabBar}>
        {items.map(([k, icon, l]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => { tap(); setTab(k); }} style={s.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={l}>
              <View style={[s.tabIcon, on && { backgroundColor: "rgba(111,239,192,0.16)" }]}>
                <Ionicons name={on ? icon : icon + "-outline"} size={21} color={on ? C.mint : C.muted} />
              </View>
              <Text style={[s.tabText, on && { color: C.ink }]}>{l}</Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}
const PAGE_BOTTOM = 130;

/* ============ welcome ============ */
function Welcome({ update }) {
  const [step, setStep] = useState(0);
  const [m, setM] = useState(true);
  return (
    <ScrollView contentContainerStyle={[s.page, { paddingTop: 28, paddingBottom: 48 }]}>
      {step === 0 ? (
        <FadeIn key="a" style={{ gap: 18 }}>
          <View style={s.badge}><Ionicons name="flask" size={14} color={C.amber} /><Text style={[s.label, { color: C.amber }]}>Test build</Text></View>
          <Text style={s.hero}>You're testing an early ICAT.</Text>
          <Text style={s.lead}>Some of the best parts are switched off. They need Apple's paid developer program, which this test doesn't have yet. Everything else works for real.</Text>
          <Glass style={{ gap: 4 }}>
            <Label>Imagine these are on</Label>
            {LOCKED.map((f) => <LockedRow key={f.name} f={f} />)}
          </Glass>
          <Text style={s.small}>For now you'll tap in sleep, food and the rest yourself. When you give feedback, tell Dag which of these you'd actually want.</Text>
          <Btn label="Got it" icon="arrow-forward" onPress={() => setStep(1)} />
        </FadeIn>
      ) : (
        <FadeIn key="b" style={{ gap: 18 }}>
          <Text style={s.hero}>Feelings are made from more than the moment.</Text>
          <Text style={s.lead}>How you slept, what you ate, who you've been around, and what's happening right now all shape how something feels. ICAT helps you notice that, name it in your own words, and pick a tool that fits.</Text>
          <Glass style={{ gap: 14 }}>
            {[["hand-right", "You're in charge.", "Every question is optional. Skip anything."],
              ["pulse", "Your body is a clue, not a verdict.", "A racing heart shows up with excitement and with fear. You decide what it means."],
              ["lock-closed", "What you write stays on this phone.", "Feedback only goes to Dag if you send it."]].map(([ic, t, d]) => (
              <View key={t} style={{ flexDirection: "row", gap: 12 }}>
                <View style={s.iconDot}><Ionicons name={ic} size={16} color={C.mint} /></View>
                <View style={{ flex: 1 }}><Text style={s.h3}>{t}</Text><Text style={s.small}>{d}</Text></View>
              </View>
            ))}
          </Glass>
          <Glass style={s.rowBetween}>
            <View style={{ flex: 1 }}><Text style={s.h3}>Morning message</Text><Text style={s.small}>A positive screen the first time you open ICAT before noon.</Text></View>
            <Switch value={m} onValueChange={setM} trackColor={{ true: C.mint, false: "#2A333D" }} thumbColor="#fff" />
          </Glass>
          <Btn label="Let's go" icon="sparkles" onPress={() => update((st) => ({ ...st, onboarded: true, morning: m, lastMorning: today() }))} />
          <Footer />
        </FadeIn>
      )}
    </ScrollView>
  );
}
function LockedRow({ f }) {
  return (
    <View style={s.lockRow}>
      <View style={[s.iconDot, { backgroundColor: "rgba(183,166,255,0.14)" }]}><Ionicons name={f.icon} size={16} color={C.lilac} /></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.h3}>{f.name}</Text><Ionicons name="lock-closed" size={11} color={C.faint} />
        </View>
        <Text style={s.small}>{f.desc}</Text>
      </View>
    </View>
  );
}

/* ============ battery (home) ============ */
function Today({ S, update, setTab, pct, hue }) {
  const low = lowestFactor(S);
  const b = S.battery.date === today() ? S.battery : {};
  const recent = S.checkins.slice(-4).reverse();
  const filled = FACTORS.filter((f) => b[f.k] != null).length;
  const pick = (k, i) => update((st) => {
    const bat = st.battery.date === today() ? { ...st.battery } : { date: today() };
    bat[k] = i; return { ...st, battery: bat };
  });
  const greet = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();
  return (
    <ScrollView contentContainerStyle={[s.page, { paddingBottom: PAGE_BOTTOM }]}>
      <FadeIn style={{ alignItems: "center", gap: 14, paddingTop: 6 }}>
        <Text style={s.small}>{greet}</Text>
        <Ring pct={pct} hue={hue}>
          <Text style={s.ringPct}>{pct == null ? "—" : pct}<Text style={s.ringUnit}>{pct == null ? "" : "%"}</Text></Text>
          <Text style={s.label}>Mental battery</Text>
        </Ring>
        <Text style={[s.lead, { textAlign: "center", maxWidth: 320 }]}>
          {pct == null ? "Charge it up below. Takes 15 seconds."
            : pct < 40 ? "Running low. Feelings hit harder today. That's your body budget, not a flaw in you."
            : pct < 70 ? "Half charged. Go easy on yourself today."
            : "Well charged. You've got room for hard stuff."}
        </Text>
      </FadeIn>
      {low && <FadeIn delay={80}><Note hue={hue} icon="flash"><Text style={{ fontFamily: F.bold }}>Lowest: {low.name.toLowerCase()}. </Text>{low.tip}</Note></FadeIn>}

      <FadeIn delay={120}>
        <Glass style={{ gap: 16 }}>
          <View style={s.rowBetween}>
            <Text style={s.h2}>What's fueling you?</Text>
            <Text style={s.small}>{filled}/5</Text>
          </View>
          {FACTORS.map((f) => (
            <View key={f.k} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={f.icon} size={15} color={b[f.k] != null ? hue : C.muted} />
                <Text style={s.h3}>{f.name}</Text>
              </View>
              <Seg opts={f.opts} value={b[f.k]} onPick={(i) => pick(f.k, i)} hue={hue} />
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="lock-closed" size={11} color={C.faint} />
            <Text style={s.tiny}>Full version: Apple Health fills this in for you.</Text>
          </View>
        </Glass>
      </FadeIn>

      <Btn label="Check in with how I feel" icon="pulse" onPress={() => setTab("checkin")} />

      {recent.length > 0 && (
        <Glass style={{ gap: 2 }}>
          <Label>Recent check-ins</Label>
          {recent.map((c) => <Entry key={c.at} c={c} />)}
        </Glass>
      )}
      <Footer />
    </ScrollView>
  );
}
function Entry({ c }) {
  const d = new Date(c.at);
  const diff = c.after != null ? c.after - c.before : null;
  const t = c.tool ? TOOLS.find((x) => x.id === c.tool) : null;
  return (
    <View style={s.entry}>
      <View style={[s.iconDot, { backgroundColor: (t?.hue || C.lilac) + "22" }]}><Ionicons name={t?.icon || "ellipse"} size={15} color={t?.hue || C.lilac} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.h3}>{c.word || "Unnamed"}</Text>
        <Text style={s.small}>{d.toLocaleDateString([], { month: "short", day: "numeric" })} · {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{c.situation ? ` · ${c.situation}` : ""}</Text>
      </View>
      {diff != null && <Text style={[s.delta, { color: diff > 0 ? C.mint : diff < 0 ? C.coral : C.muted }]}>{diff > 0 ? "+" : ""}{diff}</Text>}
    </View>
  );
}

/* ============ check-in ============ */
const freshCheck = () => ({ step: 0, energy: 50, feel: 50, signals: [], situation: "", context: "", danger: "", word: "", own: "", tool: "", after: 50 });
function CheckIn({ update, openTool, setTab, pct, S, openReview }) {
  const [c, setC] = useState(freshCheck);
  const [saved, setSaved] = useState(null);
  const [scrollOn, setScrollOn] = useState(true);
  const scroll = useRef(null);
  const set = (p) => setC((x) => ({ ...x, ...p }));
  const go = (step) => { set({ step }); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const low = lowestFactor(S);
  const quad = (c.energy >= 50 ? "h" : "l") + (c.feel >= 50 ? "p" : "u");

  if (saved != null) {
    return (
      <View style={[s.page, { flex: 1, justifyContent: "center", paddingBottom: PAGE_BOTTOM }]}>
        <FadeIn style={{ gap: 18, alignItems: "center" }}>
          <View style={[s.bigIcon, { backgroundColor: "rgba(111,239,192,0.14)" }]}><Ionicons name="checkmark" size={40} color={C.mint} /></View>
          <Text style={[s.hero, { textAlign: "center" }]}>Saved.</Text>
          <Text style={[s.lead, { textAlign: "center" }]}>{saved > 0 ? `You moved +${saved} toward pleasant. That's regulation working.` : "You noticed it and named it. That's the skill."}</Text>
          <Btn label="Back to battery" onPress={() => { setSaved(null); setTab("today"); }} style={{ alignSelf: "stretch" }} />
          <Btn ghost label="Rate ICAT" icon="star" onPress={openReview} style={{ alignSelf: "stretch" }} />
        </FadeIn>
      </View>
    );
  }
  const Nav = ({ skip = true }) => (
    <View style={s.rowBetween}>
      {c.step > 0 ? <Btn ghost label="Back" icon="arrow-back" onPress={() => go(c.step - 1)} /> : <View />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        {skip && <Pressable onPress={() => { tap(); go(c.step + 1); }}><Text style={s.link}>Skip</Text></Pressable>}
        <Btn label="Next" icon="arrow-forward" onPress={() => go(c.step + 1)} />
      </View>
    </View>
  );

  return (
    <ScrollView ref={scroll} scrollEnabled={scrollOn} contentContainerStyle={[s.page, { paddingBottom: PAGE_BOTTOM }]} keyboardShouldPersistTaps="handled">
      <Steps n={5} i={c.step} />
      {c.step === 0 && (
        <FadeIn key="0" style={{ gap: 16 }}>
          <Label>Step 1 · Body</Label>
          <Text style={s.hero2}>Where's your body at?</Text>
          <Text style={s.small}>Drag the dot. Up is more energy, right is more pleasant.</Text>
          <MoodPad energy={c.energy} feel={c.feel} setScroll={setScrollOn} onChange={(en, f) => set({ energy: en, feel: f, after: f })} />
          <Label>Signals you notice</Label>
          <View style={s.chips}>{SIGNALS.map((x) => <Chip key={x} label={x} on={c.signals.includes(x)} onPress={() => set({ signals: c.signals.includes(x) ? c.signals.filter((y) => y !== x) : [...c.signals, x] })} />)}</View>
          {c.signals.some((x) => ["Heart racing", "Tight chest", "Restless"].includes(x)) && (
            <Note hue={C.amber} icon="pulse">That's high activation. It feels the same whether you're scared, angry, or hyped. The situation decides which. That's next.</Note>
          )}
          <Nav skip={false} />
        </FadeIn>
      )}
      {c.step === 1 && (
        <FadeIn key="1" style={{ gap: 16 }}>
          <Label>Step 2 · Situation</Label>
          <Text style={s.hero2}>What's going on around you?</Text>
          <Text style={s.small}>Same body signal, different situation, different feeling.</Text>
          <View style={s.chips}>{SITUATIONS.map((x) => <Chip key={x} label={x} on={c.situation === x} onPress={() => set({ situation: c.situation === x ? "" : x })} />)}</View>
          <TextInput style={s.input} multiline value={c.context} onChangeText={(t) => set({ context: t })} placeholder="Add anything (optional, stays on your phone)" placeholderTextColor={C.faint} />
          <Glass style={{ gap: 12 }}>
            <Text style={s.h3}>Are you in danger right now?</Text>
            <View style={s.chips}>{["No", "Not sure", "Yes"].map((x) => <Chip key={x} label={x} on={c.danger === x} hue={x === "Yes" ? C.coral : C.mint} onPress={() => set({ danger: x })} />)}</View>
            {c.danger === "Yes" && <Note hue={C.coral} icon="warning"><Text style={{ fontFamily: F.bold }}>Your safety comes first. </Text>In immediate danger, call 911. To talk to someone now, call or text 988 (US). Get somewhere safe, then come back if you want.</Note>}
            {c.danger === "No" && <Text style={s.small}>Then your body's alarm might be louder than the actual threat. That's normal, and it's workable.</Text>}
          </Glass>
          <Nav />
        </FadeIn>
      )}
      {c.step === 2 && (
        <FadeIn key="2" style={{ gap: 16 }}>
          <Label>Step 3 · Name it</Label>
          <Text style={s.hero2}>What would you call it?</Text>
          <Text style={s.small}>Your word, not the app's. The more exact, the easier it is to handle.</Text>
          <View style={s.chips}>{WORDS[quad].map((w) => <Chip key={w} label={w} on={c.word === w} onPress={() => set({ word: w, own: "" })} />)}</View>
          <MoreWords quad={quad} c={c} set={set} />
          <TextInput style={s.input} value={c.own} onChangeText={(t) => set({ own: t, word: t })} placeholder="Or type your own word" placeholderTextColor={C.faint} />
          <Pressable onPress={() => { tap(); set({ word: "not sure yet" }); go(3); }}><Text style={s.link}>I honestly don't know, and that's fine</Text></Pressable>
          <Nav />
        </FadeIn>
      )}
      {c.step === 3 && (
        <FadeIn key="3" style={{ gap: 16 }}>
          <Label>Step 4 · Regulate</Label>
          <Text style={s.hero2}>Pick a tool</Text>
          <Note hue={hueFor(pct)} icon="battery-half">
            {pct != null
              ? `Battery's at ${pct}%${low ? `, lowest on ${low.name.toLowerCase()}` : ""}. ${pct < 50 ? "Part of this may be your body running on empty. Worth fixing that too." : "You've got fuel to work with."}`
              : "You haven't charged your battery today. Sleep, food and people all feed into this."}
          </Note>
          <ToolGrid onPick={(id) => { set({ tool: id }); openTool(id, () => go(4)); }} />
          <View style={s.rowBetween}>
            <Btn ghost label="Back" icon="arrow-back" onPress={() => go(2)} />
            <Pressable onPress={() => { tap(); set({ after: c.feel }); go(4); }}><Text style={s.link}>I just wanted to name it</Text></Pressable>
          </View>
        </FadeIn>
      )}
      {c.step === 4 && (
        <FadeIn key="4" style={{ gap: 16 }}>
          <Label>Step 5 · Notice</Label>
          <Text style={s.hero2}>How does it feel now?</Text>
          <Text style={s.small}>Even a small shift counts. No shift is useful info too.</Text>
          <Glass><FeelBar value={c.after} setScroll={setScrollOn} onChange={(v) => set({ after: v })} /></Glass>
          <Btn label="Save check-in" icon="checkmark" onPress={() => {
            const entry = { at: Date.now(), word: c.word, situation: c.situation, energy: c.energy, before: c.feel, after: c.after, tool: c.tool, signals: c.signals };
            update((st) => ({ ...st, checkins: [...st.checkins, entry].slice(-200) }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setSaved(c.after - c.feel); setC(freshCheck());
          }} />
        </FadeIn>
      )}
    </ScrollView>
  );
}
function MoreWords({ quad, c, set }) {
  const [open, setOpen] = useState(false);
  const others = Object.keys(WORDS).filter((k) => k !== quad).flatMap((k) => WORDS[k]);
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => { tap(); setOpen(!open); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={s.small}>{open ? "Fewer words" : "Not quite? More words"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={C.muted} />
      </Pressable>
      {open && <View style={s.chips}>{others.map((w) => <Chip key={w} label={w} on={c.word === w} onPress={() => set({ word: w, own: "" })} />)}</View>}
    </View>
  );
}
function ToolGrid({ onPick }) {
  return (
    <View style={s.grid}>
      {TOOLS.map((t) => (
        <Pressable key={t.id} onPress={() => { tap(); onPick(t.id); }} accessibilityRole="button" style={({ pressed }) => [s.tool, pressed && { transform: [{ scale: 0.97 }] }]}>
          <LinearGradient colors={[t.hue + "26", "rgba(255,255,255,0.02)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[s.iconDot, { backgroundColor: t.hue + "2A" }]}><Ionicons name={t.icon} size={17} color={t.hue} /></View>
          <Text style={[s.tiny, { color: t.hue, fontFamily: F.bold, letterSpacing: 0.8, textTransform: "uppercase" }]}>{t.stage}</Text>
          <Text style={s.h3}>{t.name}</Text>
          <Text style={s.small}>{t.desc}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ============ toolbox ============ */
function Tools({ S, update, openTool, setMorning, pct, hue }) {
  return (
    <ScrollView contentContainerStyle={[s.page, { paddingBottom: PAGE_BOTTOM }]}>
      <FadeIn style={{ gap: 6 }}>
        <Text style={s.hero2}>Toolbox</Text>
        <Text style={s.small}>Five ways to regulate, from changing where you are to changing how you read it.</Text>
      </FadeIn>
      <FadeIn delay={60}><ToolGrid onPick={(id) => openTool(id)} /></FadeIn>
      {S.iam.length > 0 && (
        <Glass style={{ gap: 2 }}>
          <Label>Your I am lines</Label>
          {S.iam.map((l, i) => (
            <View key={i} style={s.entry}>
              <Ionicons name="sparkles" size={15} color={C.coral} />
              <Text style={[s.body, { flex: 1 }]}>{l}</Text>
              <Pressable hitSlop={10} onPress={() => { tap(); update((st) => ({ ...st, iam: st.iam.filter((_, j) => j !== i) })); }}><Ionicons name="close-circle" size={20} color={C.faint} /></Pressable>
            </View>
          ))}
        </Glass>
      )}
      <Glass style={{ gap: 12 }}>
        <View style={s.rowBetween}>
          <View style={{ flex: 1 }}><Text style={s.h3}>Morning message</Text><Text style={s.small}>First open before noon.</Text></View>
          <Switch value={S.morning} onValueChange={(v) => update((st) => ({ ...st, morning: v }))} trackColor={{ true: C.mint, false: "#2A333D" }} thumbColor="#fff" />
        </View>
        <Pressable onPress={() => { tap(); setMorning(true); }}><Text style={s.link}>Preview it</Text></Pressable>
      </Glass>

      <Glass style={{ gap: 14 }}>
        <View style={s.badge}><Ionicons name="lock-closed" size={12} color={C.lilac} /><Text style={[s.label, { color: C.lilac }]}>Full version · locked</Text></View>
        <Text style={s.h2}>Your home screen, later</Text>
        <View style={s.widgetStage}>
          <BlurView intensity={30} tint="dark" style={s.widget}>
            <Ring pct={pct ?? 72} size={74} stroke={8} hue={pct == null ? C.mint : hue}><Ionicons name="flash" size={18} color={C.ink} /></Ring>
            <View>
              <Text style={s.widgetPct}>{pct ?? 72}%</Text>
              <Text style={s.tiny}>{pct == null ? "Example" : "Battery"}</Text>
            </View>
          </BlurView>
          <View style={s.fakeApps}>{[C.coral, C.cyan, C.amber, C.lilac].map((c2) => <View key={c2} style={[s.fakeApp, { backgroundColor: c2 + "55" }]} />)}</View>
        </View>
        {LOCKED.map((f) => <LockedRow key={f.name} f={f} />)}
      </Glass>
      <Footer />
    </ScrollView>
  );
}

/* ============ tool sheets ============ */
function ToolSheet({ id, onClose, update }) {
  const t = TOOLS.find((x) => x.id === id);
  const Body = { breathe: Breathe, ground: Ground, rethink: Rethink, shift: ShiftTool, iam: IAm }[id];
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Backdrop hue={t.hue} />
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[s.page, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
            <View style={s.rowBetween}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.label, { color: t.hue }]}>{t.stage}</Text>
                <Text style={s.hero2}>{t.name}</Text>
              </View>
              <Pressable onPress={() => { tap(); onClose(); }} style={s.close} accessibilityLabel="Close"><Ionicons name="close" size={22} color={C.ink} /></Pressable>
            </View>
            <Body done={onClose} update={update} hue={t.hue} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

function Breathe({ done, hue }) {
  const total = 6;
  const scale = useRef(new Animated.Value(1)).current;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState("Ready");
  const [running, setRunning] = useState(false);
  const timers = useRef([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); scale.stopAnimation(); }, []);
  const start = async () => {
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    setRunning(true);
    const cycle = (r) => {
      if (r >= total) { setPhase("Done"); setRound(total + 1); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); return; }
      setRound(r + 1); setPhase("Breathe in"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.timing(scale, { toValue: 1.9, duration: reduce ? 0 : 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start();
      timers.current.push(setTimeout(() => {
        setPhase("Breathe out"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
        Animated.timing(scale, { toValue: 1, duration: reduce ? 0 : 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start();
        timers.current.push(setTimeout(() => cycle(r + 1), 6000));
      }, 4000));
    };
    cycle(0);
  };
  return (
    <View style={{ gap: 20 }}>
      <Text style={s.lead}>In through your nose for 4. Out slow for 6. A longer exhale tells your body it's safe to slow down.</Text>
      <View style={s.breathStage}>
        <Animated.View style={[s.breathRing, { borderColor: hue + "55", transform: [{ scale }] }]} />
        <Animated.View style={{ transform: [{ scale }] }}>
          <LinearGradient colors={[hue, C.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.breathBall} />
        </Animated.View>
        <Text style={s.breathText}>{phase}</Text>
      </View>
      <Text style={[s.h3, { textAlign: "center", color: C.muted }]}>
        {round === 0 ? `${total} breaths · feel a tap on each change` : round > total ? "Nice. Notice anything different?" : `Breath ${round} of ${total}`}
      </Text>
      {!running && <Btn label="Start" icon="play" onPress={start} />}
      {round > total && <Btn label="Finish" icon="checkmark" onPress={done} />}
    </View>
  );
}

function Ground({ done, hue }) {
  const steps = [[5, "things you can see", "eye"], [4, "things you can feel", "hand-left"], [3, "things you can hear", "ear"], [2, "things you can smell", "flower"], [1, "slow breath", "leaf"]];
  const [i, setI] = useState(0);
  return (
    <View style={{ gap: 20 }}>
      <Text style={s.lead}>Pulls your attention out of your head and into the room. Say them in your head or out loud.</Text>
      <FadeIn key={i}>
        <Glass style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
          <Ionicons name={steps[i][2]} size={28} color={hue} />
          <Text style={[s.ringPct, { fontSize: 88, lineHeight: 96 }]}>{steps[i][0]}</Text>
          <Text style={[s.h2, { textAlign: "center" }]}>{steps[i][1]}</Text>
        </Glass>
      </FadeIn>
      <Steps n={5} i={i} hue={hue} />
      <Btn label={i < steps.length - 1 ? "Got them" : "Finish"} icon={i < steps.length - 1 ? "arrow-forward" : "checkmark"} onPress={() => (i < steps.length - 1 ? setI(i + 1) : done())} />
    </View>
  );
}

function Rethink({ done, update, hue }) {
  const prompts = [
    ["What happened, just the facts?", "e.g. I didn't get the job I applied for."],
    ["What's the story your brain is telling?", "e.g. I'm not good enough. I'll never get hired."],
    ["What else could it mean?", "e.g. They had 300 applicants. One no isn't a pattern."],
    ["What would you tell a friend?", "e.g. Their loss. Keep sending them out."],
    ["Anything useful in this?", "e.g. Now I know to tailor my resume more."],
  ];
  const [i, setI] = useState(0);
  const [ans, setAns] = useState(["", "", "", "", ""]);
  const [line, setLine] = useState("");
  if (i === prompts.length) {
    const take = [ans[2], ans[3], ans[4]].filter((x) => x.trim());
    return (
      <FadeIn style={{ gap: 16 }}>
        <Label>Your new take</Label>
        <Glass style={{ gap: 10, borderColor: hue + "55" }}>
          {take.length ? take.map((x, j) => <Text key={j} style={s.lead}>{x}</Text>) : <Text style={s.lead}>You worked through it. Sometimes slowing the story down is enough.</Text>}
        </Glass>
        <Text style={s.small}>Turn it into an "I am" line to keep?</Text>
        <TextInput style={s.input} value={line} onChangeText={setLine} placeholder="I am someone who keeps going." placeholderTextColor={C.faint} />
        <Btn label="Save line & finish" icon="sparkles" onPress={() => { if (line.trim()) update((st) => ({ ...st, iam: [...st.iam, line.trim()] })); done(); }} />
        <Btn ghost label="Just finish" onPress={done} />
      </FadeIn>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.lead}>Same situation, different reading, different feeling. This is reappraisal, one of the best-studied regulation skills there is.</Text>
      <Steps n={5} i={i} hue={hue} />
      <FadeIn key={i} style={{ gap: 12 }}>
        <Text style={s.h2}>{prompts[i][0]}</Text>
        <TextInput style={[s.input, { minHeight: 120 }]} multiline value={ans[i]} onChangeText={(t) => setAns((a) => a.map((x, j) => (j === i ? t : x)))} placeholder={prompts[i][1]} placeholderTextColor={C.faint} />
      </FadeIn>
      <View style={s.rowBetween}>
        {i > 0 ? <Btn ghost label="Back" icon="arrow-back" onPress={() => setI(i - 1)} /> : <View />}
        <Btn label={i < prompts.length - 1 ? "Next" : "See my new take"} icon="arrow-forward" onPress={() => setI(i + 1)} />
      </View>
    </View>
  );
}

function ShiftTool({ done, hue }) {
  const moves = ["Step outside for 5 min", "Move to another room", "Text someone I trust", "Eat or drink water", "Do one tiny piece of it", "Put it down till later", "Ask for help", "Leave the situation"];
  const [pick, setPick] = useState([]);
  return (
    <View style={{ gap: 18 }}>
      <Text style={s.lead}>Sometimes the fastest way to change a feeling is to change where you are or what's in front of you.</Text>
      <Text style={s.h2}>One thing you can change in the next 10 minutes?</Text>
      <View style={s.chips}>{moves.map((m) => <Chip key={m} label={m} hue={hue} on={pick.includes(m)} onPress={() => setPick(pick.includes(m) ? pick.filter((x) => x !== m) : [...pick, m])} />)}</View>
      {pick.length > 0 && <Note hue={hue} icon="flag"><Text style={{ fontFamily: F.bold }}>Plan: {pick.join(", ").toLowerCase()}. </Text>Go do it, then come back.</Note>}
      <Btn label="I'll do it" icon="checkmark" disabled={!pick.length} onPress={done} />
    </View>
  );
}

function IAm({ done, update, hue }) {
  const starters = ["I am capable of hard things.", "I am allowed to take up space.", "I am more than one bad day.", "I am getting better at this.", "I am enough right now.", "I am someone who keeps going."];
  const [v, setV] = useState("I am ");
  return (
    <View style={{ gap: 18 }}>
      <Text style={s.lead}>Short, present tense, believable. Pick one or write your own. These show up in your morning message.</Text>
      <View style={s.chips}>{starters.map((x) => <Chip key={x} label={x} hue={hue} on={v === x} onPress={() => setV(x)} />)}</View>
      <TextInput style={[s.input, { fontFamily: F.displaySemi, fontSize: 18 }]} value={v} onChangeText={setV} placeholderTextColor={C.faint} />
      <Btn label="Save" icon="sparkles" onPress={() => { const l = v.trim(); if (l && l !== "I am") update((st) => ({ ...st, iam: [...st.iam, l] })); done(); }} />
    </View>
  );
}

/* ============ morning ============ */
function MorningScreen({ S, hue, onClose }) {
  const [line] = useState(() => (S.iam.length ? S.iam[Math.floor(Math.random() * S.iam.length)] : "I am capable of hard things."));
  const msg = MORNING[new Date().getDate() % MORNING.length];
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Backdrop hue={C.amber} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={[s.page, { flex: 1, justifyContent: "center", gap: 24 }]}>
            <FadeIn style={{ gap: 24 }}>
              <View style={s.badge}><Ionicons name="sunny" size={14} color={C.amber} /><Text style={[s.label, { color: C.amber }]}>Good morning</Text></View>
              <Text style={[s.hero, { fontSize: 34, lineHeight: 42 }]}>{line}</Text>
              <Text style={s.lead}>{msg}</Text>
            </FadeIn>
            <FadeIn delay={300} style={{ gap: 14 }}>
              <Btn label="Start my day" icon="arrow-forward" onPress={onClose} />
              <Text style={s.tiny}>Turn this off in the Toolbox. In the full version this lands as a notification.</Text>
            </FadeIn>
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

/* ============ feedback ============ */
const EMPTY_F = { helpful: 0, easy: 0, again: 0, want: [], best: "", cut: "", missing: "", other: "", name: "" };
function Feedback({ S }) {
  const [fb, setFb] = useState(EMPTY_F);
  const [status, setStatus] = useState("");
  const set = (p) => setFb((f) => ({ ...f, ...p }));
  const Q = [["helpful", "Did it help you feel better or think clearer?"], ["easy", "How easy was it to use?"], ["again", "Would you open it again on your own?"]];
  const used = Object.entries(S.toolsUsed).map(([k, n]) => `${TOOLS.find((t) => t.id === k)?.name} x${n}`).join(", ") || "none";
  const text = () => [
    `ICAT feedback${fb.name ? ` from ${fb.name}` : ""}`,
    `Helped: ${fb.helpful || "-"}/5 | Easy: ${fb.easy || "-"}/5 | Use again: ${fb.again || "-"}/5`,
    `Want most: ${fb.want.join(", ") || "-"}`,
    `Best part: ${fb.best || "-"}`, `Cut / ass: ${fb.cut || "-"}`, `Missing: ${fb.missing || "-"}`, `Other: ${fb.other || "-"}`,
    `Check-ins done: ${S.checkins.length} | Tools: ${used}`,
  ].join("\n");
  const send = async () => {
    if (!fb.helpful && !fb.best && !fb.cut && !fb.missing && !fb.other && !fb.want.length) { setStatus("Answer at least one question first."); return; }
    const r = await sendText(text());
    setStatus(SEND_MSG[r]);
    if (r === "sent") setFb(EMPTY_F);
  };
  return (
    <ScrollView contentContainerStyle={[s.page, { paddingBottom: PAGE_BOTTOM }]} keyboardShouldPersistTaps="handled">
      <FadeIn style={{ gap: 6 }}>
        <Text style={s.hero2}>Be honest.{"\n"}Is it ass?</Text>
        <Text style={s.small}>Dag reads every one. Rough answers beat nice ones.</Text>
      </FadeIn>
      {Q.map(([k, q]) => (
        <Glass key={k} style={{ gap: 12 }}>
          <Text style={s.h3}>{q}</Text>
          <Seg opts={["1", "2", "3", "4", "5"]} value={fb[k] - 1} onPick={(i) => set({ [k]: i + 1 })} />
          <View style={s.rowBetween}><Text style={s.tiny}>Nope</Text><Text style={s.tiny}>Yes, a lot</Text></View>
        </Glass>
      ))}
      <Glass style={{ gap: 12 }}>
        <Text style={s.h3}>Which locked feature would you want most?</Text>
        <View style={s.chips}>{LOCKED.map((f) => <Chip key={f.name} label={f.name} hue={C.lilac} on={fb.want.includes(f.name)} onPress={() => set({ want: fb.want.includes(f.name) ? fb.want.filter((x) => x !== f.name) : [...fb.want, f.name] })} />)}</View>
      </Glass>
      {[["best", "Best part?"], ["cut", "What's ass / what should be cut?"], ["missing", "What's missing?"], ["other", "Anything else"], ["name", "Your name"]].map(([k, l]) => (
        <View key={k} style={{ gap: 8 }}>
          <Text style={s.h3}>{l}</Text>
          <TextInput style={s.input} multiline={k !== "name"} value={fb[k]} onChangeText={(t) => set({ [k]: t })} placeholderTextColor={C.faint} />
        </View>
      ))}
      <Text style={s.small}>Send opens your share sheet. Pick Messages and send it to Dag. It includes your answers plus counts (check-ins, tools opened), never what you wrote inside a check-in or tool.</Text>
      <Btn label="Send to Dag" icon="paper-plane" onPress={send} />
      {!!status && <Text style={[s.body, { textAlign: "center" }]}>{status}</Text>}
      <Footer />
    </ScrollView>
  );
}

/* ============ styles ============ */
const s = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 8, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 },
  logo: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logoText: { fontFamily: F.display, color: C.onAccent, fontSize: 16, marginTop: Platform.OS === "android" ? -2 : 0 },
  wordmark: { fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: 2 },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.glass, borderWidth: 1, borderColor: C.edge, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: F.bold, color: C.ink, fontSize: 13, fontVariant: ["tabular-nums"] },
  hero: { fontFamily: F.display, fontSize: 30, lineHeight: 38, color: C.ink, letterSpacing: -0.5 },
  hero2: { fontFamily: F.display, fontSize: 25, lineHeight: 32, color: C.ink, letterSpacing: -0.3 },
  h2: { fontFamily: F.heavy, fontSize: 19, lineHeight: 25, color: C.ink },
  h3: { fontFamily: F.bold, fontSize: 15.5, lineHeight: 21, color: C.ink },
  lead: { fontFamily: F.body, fontSize: 16.5, lineHeight: 25, color: "#C9D2DA" },
  body: { fontFamily: F.body, fontSize: 15.5, lineHeight: 22, color: C.ink },
  small: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.muted },
  tiny: { fontFamily: F.semi, fontSize: 12, lineHeight: 16, color: C.faint },
  label: { fontFamily: F.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: C.muted },
  link: { fontFamily: F.bold, color: C.mint, fontSize: 14.5 },
  footer: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.faint, textAlign: "center", marginTop: 6 },
  glass: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.edge, borderRadius: 24, padding: 18, overflow: "hidden" },
  note: { flexDirection: "row", gap: 10, borderWidth: 1, borderRadius: 18, padding: 14 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: C.glass, borderWidth: 1, borderColor: C.edge, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  iconDot: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(111,239,192,0.12)" },
  bigIcon: { width: 84, height: 84, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  btn: { flexDirection: "row", gap: 8, borderRadius: 99, paddingVertical: 15, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", minHeight: 52 },
  btnText: { fontFamily: F.heavy, color: C.onAccent, fontSize: 15.5 },
  btnGhost: { backgroundColor: C.glass, borderWidth: 1, borderColor: C.edge },
  btnGhostText: { fontFamily: F.bold, color: C.ink, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.edge, backgroundColor: C.glass, borderRadius: 99, paddingVertical: 9, paddingHorizontal: 14 },
  chipText: { fontFamily: F.semi, color: C.ink, fontSize: 14 },
  seg: { flexDirection: "row", gap: 4, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  segText: { fontFamily: F.semi, color: C.muted, fontSize: 13 },
  input: { borderWidth: 1, borderColor: C.edge, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 16, padding: 14, fontSize: 16, fontFamily: F.body, color: C.ink, minHeight: 52, textAlignVertical: "top" },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)" },
  ringPct: { fontFamily: F.display, fontSize: 58, lineHeight: 66, color: C.ink, fontVariant: ["tabular-nums"] },
  ringUnit: { fontFamily: F.displaySemi, fontSize: 24, color: C.muted },
  entry: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.edge },
  delta: { fontFamily: F.display, fontSize: 16, fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tool: { width: "48%", flexGrow: 1, borderWidth: 1, borderColor: C.edge, backgroundColor: C.glass, borderRadius: 22, padding: 16, gap: 6, minHeight: 150, overflow: "hidden" },
  lockRow: { flexDirection: "row", gap: 12, paddingTop: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: C.edge },
  pad: { height: 270, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: C.edge },
  padLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.12)" },
  padCorner: { position: "absolute", fontFamily: F.bold, fontSize: 9.5, letterSpacing: 1.1, color: "rgba(255,255,255,0.55)" },
  padDot: { position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff", borderWidth: 3, borderColor: "rgba(9,13,18,0.35)" },
  padDotHalo: { position: "absolute", width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.16)" },
  bar: { height: 56, borderRadius: 18, overflow: "hidden" },
  tabWrap: { position: "absolute", left: 16, right: 16 },
  tabBar: { flexDirection: "row", borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: C.edge, backgroundColor: "rgba(15,22,33,0.72)", paddingVertical: 8, paddingHorizontal: 6 },
  tabBtn: { flex: 1, alignItems: "center", gap: 3 },
  tabIcon: { width: 46, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  tabText: { fontFamily: F.semi, fontSize: 11, color: C.muted },
  sheetBack: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheetCard: { backgroundColor: "#121A24", borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: C.edge, paddingHorizontal: 20, paddingTop: 10, gap: 14 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 4 },
  close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.edge, backgroundColor: C.glass, alignItems: "center", justifyContent: "center" },
  breathStage: { height: 280, alignItems: "center", justifyContent: "center" },
  breathRing: { position: "absolute", width: 210, height: 210, borderRadius: 105, borderWidth: 1.5 },
  breathBall: { width: 110, height: 110, borderRadius: 55, opacity: 0.9 },
  breathText: { position: "absolute", fontFamily: F.display, fontSize: 17, color: C.onAccent },
  widgetStage: { flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderRadius: 26, backgroundColor: "rgba(0,0,0,0.3)" },
  widget: { width: 150, height: 150, borderRadius: 30, padding: 14, justifyContent: "space-between", overflow: "hidden", borderWidth: 1, borderColor: C.edge, backgroundColor: "rgba(255,255,255,0.06)" },
  widgetPct: { fontFamily: F.display, fontSize: 24, color: C.ink },
  fakeApps: { flexDirection: "row", flexWrap: "wrap", gap: 12, width: 112 },
  fakeApp: { width: 50, height: 50, borderRadius: 14 },
});
