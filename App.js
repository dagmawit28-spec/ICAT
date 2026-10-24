import { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, Animated, Easing,
  Share, Switch, useColorScheme, StyleSheet, AccessibilityInfo,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";

/* ---------------- theme ---------------- */
const LIGHT = { bg: "#E9EEF0", surface: "#FFFFFF", ink: "#14212B", muted: "#5A6B77", line: "#D3DCE1", accent: "#1E6B6A", accentInk: "#FFFFFF", soft: "#D5E9E7", charge: "#E3A13A", low: "#D3604E", good: "#3E9A63" };
const DARK = { bg: "#0F171C", surface: "#18232A", ink: "#E6EEF1", muted: "#93A5B0", line: "#2A3943", accent: "#5FC1BC", accentInk: "#0B1A1A", soft: "#1D3836", charge: "#F0B455", low: "#EE7D6B", good: "#64C48A" };

/* ---------------- content ---------------- */
const KEY = "icat.v1";
const today = () => new Date().toISOString().slice(0, 10);
const FACTORS = [
  { k: "sleep", name: "Sleep", opts: ["<5h", "5–6h", "7–8h", "9h+"], val: [0.15, 0.55, 1, 0.85], w: 0.32, tip: "Short sleep makes everything feel louder." },
  { k: "food", name: "Food", opts: ["Nothing", "Snacks", "1 meal", "2+ meals"], val: [0.1, 0.4, 0.7, 1], w: 0.24, tip: "An empty tank can feel like anxiety or irritation." },
  { k: "water", name: "Water", opts: ["Barely", "Some", "Plenty"], val: [0.25, 0.65, 1], w: 0.14, tip: "Dehydration shows up as fog and fatigue." },
  { k: "move", name: "Movement", opts: ["None", "A little", "Workout"], val: [0.35, 0.8, 1], w: 0.12, tip: "Movement spends energy and refills it." },
  { k: "people", name: "Connection", opts: ["Isolated", "Some", "Good time"], val: [0.3, 0.7, 1], w: 0.18, tip: "Other people regulate us too." },
];
const WORDS = {
  hu: ["anxious", "stressed", "angry", "frustrated", "overwhelmed", "scared", "on edge", "jealous"],
  lu: ["sad", "drained", "lonely", "disappointed", "numb", "discouraged", "ashamed", "bored"],
  hp: ["excited", "hyped", "proud", "motivated", "locked in", "happy", "amped", "inspired"],
  lp: ["calm", "content", "relieved", "grateful", "chill", "peaceful", "hopeful", "rested"],
};
const ALL_WORDS = [...WORDS.hu, ...WORDS.lu, ...WORDS.hp, ...WORDS.lp];
const SITUATIONS = ["School / work", "Someone in my life", "Game / performance", "Rejection or setback", "Money", "My body / health", "Nothing specific", "Rather not say"];
const SIGNALS = ["Heart racing", "Tight chest", "Stomach off", "Tired", "Restless", "Hungry", "Tense jaw/shoulders", "Nothing I notice"];
const TOOLS = [
  { id: "shift", stage: "Change the situation", name: "Change something", desc: "One small move for the next 10 minutes." },
  { id: "ground", stage: "Shift attention", name: "5-4-3-2-1", desc: "Bring your attention back to the room." },
  { id: "rethink", stage: "Rethink it", name: "Rethink it", desc: "Find another way to read what happened." },
  { id: "breathe", stage: "Calm the body", name: "Long exhale", desc: "In 4, out 6. About a minute." },
  { id: "iam", stage: "Self-talk", name: "I am…", desc: "A line you can come back to." },
];
const LOCKED = [
  { name: "Auto battery from Apple Health", desc: "Sleep, heart rate and steps fill in your battery on their own. No tapping." },
  { name: "Home screen widget", desc: "Your battery % on your home screen, so you see it without opening the app." },
  { name: "Body check-in nudges", desc: "When your heart rate jumps and you're not working out, ICAT asks what's going on. It never guesses the emotion for you." },
  { name: "Morning notification", desc: "Your I am line waiting on your lock screen when you wake up." },
  { name: "Phone break, only when you ask", desc: "Tell ICAT you want off your phone and it helps you stop. It never locks you out on its own." },
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

/* ---------------- app ---------------- */
export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const scheme = useColorScheme();
  const T = scheme === "dark" ? DARK : LIGHT;
  const s = makeStyles(T);
  const [S, setS] = useState(null);
  const [tab, setTab] = useState("today");
  const [tool, setTool] = useState(null); // {id, onDone}
  const [morning, setMorning] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      let st = { ...DEFAULT };
      try { st = { ...DEFAULT, ...(JSON.parse(raw) || {}) }; } catch (e) {}
      const h = new Date().getHours();
      if (st.onboarded && st.morning && st.lastMorning !== today() && h >= 4 && h < 12) {
        st.lastMorning = today();
        setMorning(true);
      }
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

  if (!S) return <View style={[s.fill, { backgroundColor: T.bg }]} />;

  const openTool = (id, onDone) => {
    update((st) => ({ ...st, toolsUsed: { ...st.toolsUsed, [id]: (st.toolsUsed[id] || 0) + 1 } }));
    setTool({ id, onDone });
  };
  const ctx = { S, update, T, s, openTool, setTab, setMorning };

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: T.bg }]} edges={["top", "left", "right"]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {!S.onboarded ? (
        <Welcome {...ctx} />
      ) : (
        <>
          <Header {...ctx} />
          <View style={s.fill}>
            {tab === "today" && <Today {...ctx} />}
            {tab === "checkin" && <CheckIn {...ctx} />}
            {tab === "tools" && <Tools {...ctx} />}
            {tab === "feedback" && <Feedback {...ctx} />}
          </View>
          <Tabs tab={tab} setTab={setTab} T={T} s={s} />
        </>
      )}
      <Modal visible={!!tool} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setTool(null)}>
        {tool && (
          <ToolSheet {...ctx} id={tool.id} onClose={() => { const d = tool.onDone; setTool(null); d && d(); }} />
        )}
      </Modal>
      <Modal visible={morning} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setMorning(false)}>
        <MorningScreen {...ctx} onClose={() => { setMorning(false); update((st) => ({ ...st, lastMorning: today() })); }} />
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- shared bits ---------------- */
function Btn({ s, label, onPress, ghost, disabled, style }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [ghost ? s.btnGhost : s.btn, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }, style]}>
      <Text style={ghost ? s.btnGhostText : s.btnText}>{label}</Text>
    </Pressable>
  );
}
function Chip({ s, label, on, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}
function Seg({ s, opts, value, onPick, label }) {
  return (
    <View style={s.seg} accessibilityLabel={label}>
      {opts.map((o, i) => (
        <Pressable key={o} onPress={() => onPick(i)} accessibilityRole="button" accessibilityState={{ selected: value === i }}
          style={[s.segBtn, value === i && s.chipOn]}>
          <Text style={[s.segText, value === i && s.chipTextOn]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const Label = ({ s, children }) => <Text style={s.label}>{children}</Text>;
const Note = ({ s, children }) => <View style={s.note}><Text style={s.body}>{children}</Text></View>;
function Footer({ s }) {
  return <Text style={[s.small, { textAlign: "center", marginTop: 8 }]}>ICAT is a test build, not therapy. In crisis in the US, call or text 988. In danger, call 911.</Text>;
}

function Header({ S, T, s }) {
  const p = batteryPct(S);
  const color = p == null ? T.muted : p < 40 ? T.low : p < 70 ? T.charge : T.good;
  return (
    <View style={s.header}>
      <View>
        <Text style={s.wordmark}>ICAT</Text>
        <Text style={s.label}>I can do all things</Text>
      </View>
      <View style={s.pill}><Text style={[s.pillText, { color }]}>{p == null ? "Charge?" : `${p}%`}</Text></View>
    </View>
  );
}

function Tabs({ tab, setTab, s }) {
  const items = [["today", "Battery"], ["checkin", "Check in"], ["tools", "Toolbox"], ["feedback", "Feedback"]];
  return (
    <SafeAreaView edges={["bottom"]} style={s.tabs}>
      {items.map(([k, l]) => (
        <Pressable key={k} onPress={() => setTab(k)} style={s.tabBtn} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
          <View style={[s.tabDot, tab === k && s.tabDotOn]} />
          <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l}</Text>
        </Pressable>
      ))}
    </SafeAreaView>
  );
}

/* ---------------- welcome + test build notice ---------------- */
function Welcome({ update, s, T }) {
  const [step, setStep] = useState(0);
  const [m, setM] = useState(true);
  if (step === 0) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Label s={s}>Test build · please read</Label>
        <Text style={s.h1}>You're testing an early version of ICAT.</Text>
        <Text style={s.body}>Some of the best parts are switched off right now. They need Apple's paid developer program, which this test doesn't have yet. Everything else works for real.</Text>
        <View style={s.card}>
          <Label s={s}>Imagine these are on</Label>
          {LOCKED.map((f) => (
            <View key={f.name} style={s.lockRow}>
              <Text style={s.h3}>{f.name}</Text>
              <Text style={s.small}>{f.desc}</Text>
            </View>
          ))}
        </View>
        <Text style={s.small}>For now you'll tap in your sleep, food and the rest by hand. When you give feedback, tell Dag which of these you'd actually want.</Text>
        <Btn s={s} label="Got it" onPress={() => setStep(1)} />
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.h1}>Feelings are made from more than the moment.</Text>
      <Text style={s.body}>How you slept, what you ate, who you've been around, and what's happening right now all shape how something feels. ICAT helps you notice that, name it in your own words, and pick a tool that fits.</Text>
      <View style={s.card}>
        <Label s={s}>How this works</Label>
        <Text style={s.body}><Text style={s.b}>You're in charge.</Text> Every question is optional. Skip anything.</Text>
        <Text style={s.body}><Text style={s.b}>Your body is a clue, not a verdict.</Text> A racing heart shows up with excitement and with fear. You decide what it means.</Text>
        <Text style={s.body}><Text style={s.b}>What you write stays on this phone.</Text> Feedback only goes to Dag if you send it.</Text>
      </View>
      <View style={[s.card, s.rowBetween]}>
        <View style={{ flex: 1 }}>
          <Text style={s.h3}>Morning message</Text>
          <Text style={s.small}>A short positive screen the first time you open ICAT before noon.</Text>
        </View>
        <Switch value={m} onValueChange={setM} trackColor={{ true: T.accent }} />
      </View>
      <Btn s={s} label="Start" onPress={() => update((st) => ({ ...st, onboarded: true, morning: m, lastMorning: today() }))} />
      <Footer s={s} />
    </ScrollView>
  );
}

/* ---------------- battery ---------------- */
function BatteryCell({ pct, T, size = 1 }) {
  const color = pct == null ? T.line : pct < 40 ? T.low : pct < 70 ? T.charge : T.good;
  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 26 * size, height: 7 * size, backgroundColor: T.ink, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
      <View style={{ width: 74 * size, height: 124 * size, borderWidth: 3, borderColor: T.ink, borderRadius: 12 * size, padding: 5 * size, justifyContent: "flex-end" }}>
        <View style={{ height: `${pct ?? 0}%`, backgroundColor: color, borderRadius: 6 * size }} />
      </View>
    </View>
  );
}

function Today({ S, update, T, s, setTab }) {
  const p = batteryPct(S);
  const low = lowestFactor(S);
  const b = S.battery.date === today() ? S.battery : {};
  const recent = S.checkins.slice(-4).reverse();
  const pick = (k, i) => update((st) => {
    const bat = st.battery.date === today() ? { ...st.battery } : { date: today() };
    bat[k] = i;
    return { ...st, battery: bat };
  });
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.card}>
        <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
          <BatteryCell pct={p} T={T} />
          <View style={{ flex: 1, gap: 6 }}>
            <Label s={s}>Mental battery · today</Label>
            <Text style={s.pct}>{p == null ? "—" : `${p}%`}</Text>
            <Text style={s.small}>
              {p == null ? "Tap below to charge it up. Takes 15 seconds."
                : p < 40 ? "Running low. Feelings can hit harder today. That's your body budget talking, not a flaw in you."
                : p < 70 ? "Half charged. Good day to go easy on yourself."
                : "Well charged. You've got room to handle hard stuff."}
            </Text>
          </View>
        </View>
        {low && <Note s={s}><Text style={s.b}>Lowest today: {low.name.toLowerCase()}.</Text> {low.tip}</Note>}
      </View>
      <View style={s.card}>
        <Text style={s.h3}>What's fueling you today?</Text>
        {FACTORS.map((f) => (
          <View key={f.k} style={{ gap: 6 }}>
            <Text style={s.body}>{f.name}</Text>
            <Seg s={s} label={f.name} opts={f.opts} value={b[f.k]} onPick={(i) => pick(f.k, i)} />
          </View>
        ))}
        <Text style={s.small}>Full version: Apple Health fills this in for you.</Text>
      </View>
      <Btn s={s} label="Check in with how I feel" onPress={() => setTab("checkin")} />
      {recent.length > 0 && (
        <View style={s.card}>
          <Label s={s}>Recent check-ins</Label>
          {recent.map((c) => <Entry key={c.at} c={c} s={s} T={T} />)}
        </View>
      )}
      <Footer s={s} />
    </ScrollView>
  );
}

function Entry({ c, s, T }) {
  const d = new Date(c.at);
  const diff = c.after != null ? c.after - c.before : null;
  const toolName = c.tool ? TOOLS.find((t) => t.id === c.tool)?.name : null;
  return (
    <View style={s.entry}>
      <View style={s.rowBetween}>
        <Text style={s.b}>{c.word || "Unnamed"}</Text>
        <Text style={s.small}>{d.toLocaleDateString([], { month: "short", day: "numeric" })} {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
      </View>
      <Text style={s.small}>
        {c.situation || ""}{toolName ? ` · used ${toolName}` : ""}
        {diff != null ? <Text style={{ color: diff > 0 ? T.good : diff < 0 ? T.low : T.muted, fontWeight: "700" }}>{` · ${diff > 0 ? "+" : ""}${diff} feel`}</Text> : null}
      </Text>
    </View>
  );
}

/* ---------------- check-in ---------------- */
const freshCheck = () => ({ step: 0, energy: 50, feel: 50, signals: [], situation: "", context: "", danger: "", word: "", own: "", tool: "", after: 50 });

function CheckIn({ S, update, T, s, openTool, setTab }) {
  const [C, setC] = useState(freshCheck);
  const [saved, setSaved] = useState(null);
  const scroll = useRef(null);
  const set = (patch) => setC((c) => ({ ...c, ...patch }));
  const go = (step) => { set({ step }); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const p = batteryPct(S), low = lowestFactor(S);

  if (saved != null) {
    return (
      <ScrollView contentContainerStyle={[s.page, { paddingTop: 40 }]}>
        <Text style={[s.h1, { textAlign: "center" }]}>Saved.</Text>
        <Text style={[s.body, { textAlign: "center" }]}>
          {saved > 0 ? `You moved +${saved} toward pleasant. That's regulation working.` : "You noticed it and named it. That's the skill."}
        </Text>
        <Btn s={s} label="Back to battery" onPress={() => { setSaved(null); setTab("today"); }} />
      </ScrollView>
    );
  }

  const Dots = () => (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[s.dot, i <= C.step && { backgroundColor: T.accent }]} />)}
    </View>
  );
  const Nav = ({ skip = true, onNext }) => (
    <View style={s.rowBetween}>
      {C.step > 0 ? <Btn s={s} ghost label="Back" onPress={() => go(C.step - 1)} /> : <View />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        {skip && <Pressable onPress={() => go(C.step + 1)}><Text style={s.link}>Skip</Text></Pressable>}
        <Btn s={s} label="Next" onPress={onNext || (() => go(C.step + 1))} />
      </View>
    </View>
  );
  const quad = (C.energy >= 50 ? "h" : "l") + (C.feel >= 50 ? "p" : "u");

  return (
    <ScrollView ref={scroll} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Dots />
      {C.step === 0 && (
        <>
          <Text style={s.h2}>What's your body doing?</Text>
          <Text style={s.small}>No right answers. Just where you're at right now.</Text>
          <View style={s.card}>
            <Text style={s.b}>Energy</Text>
            <Slider minimumValue={0} maximumValue={100} value={C.energy} onValueChange={(v) => set({ energy: Math.round(v) })} minimumTrackTintColor={T.accent} thumbTintColor={T.accent} />
            <View style={s.rowBetween}><Text style={s.small}>Low, heavy</Text><Text style={s.small}>Wired, activated</Text></View>
            <Text style={[s.b, { marginTop: 8 }]}>Feel</Text>
            <Slider minimumValue={0} maximumValue={100} value={C.feel} onValueChange={(v) => set({ feel: Math.round(v), after: Math.round(v) })} minimumTrackTintColor={T.accent} thumbTintColor={T.accent} />
            <View style={s.rowBetween}><Text style={s.small}>Unpleasant</Text><Text style={s.small}>Pleasant</Text></View>
          </View>
          <Label s={s}>Signals you notice</Label>
          <View style={s.chips}>
            {SIGNALS.map((x) => <Chip key={x} s={s} label={x} on={C.signals.includes(x)} onPress={() => set({ signals: C.signals.includes(x) ? C.signals.filter((y) => y !== x) : [...C.signals, x] })} />)}
          </View>
          {C.signals.some((x) => ["Heart racing", "Tight chest", "Restless"].includes(x)) && (
            <Note s={s}>That's high activation. It feels the same in your body whether you're scared, angry, or hyped. The situation decides which. That's next.</Note>
          )}
          <Nav skip={false} />
        </>
      )}
      {C.step === 1 && (
        <>
          <Text style={s.h2}>What's going on around you?</Text>
          <Text style={s.small}>Same body signal, different situation, different feeling.</Text>
          <View style={s.chips}>
            {SITUATIONS.map((x) => <Chip key={x} s={s} label={x} on={C.situation === x} onPress={() => set({ situation: C.situation === x ? "" : x })} />)}
          </View>
          <TextInput style={s.input} multiline value={C.context} onChangeText={(t) => set({ context: t })} placeholder="Anything you want to add (optional, stays on your phone)" placeholderTextColor={T.muted} />
          <View style={s.card}>
            <Text style={s.b}>Are you in danger right now?</Text>
            <View style={s.chips}>
              {["No", "Not sure", "Yes"].map((x) => <Chip key={x} s={s} label={x} on={C.danger === x} onPress={() => set({ danger: x })} />)}
            </View>
            {C.danger === "Yes" && (
              <View style={s.warn}><Text style={s.body}><Text style={s.b}>Your safety comes first.</Text> If you're in immediate danger, call 911. To talk to someone now, call or text 988 (US). Get somewhere safe, then come back if you want.</Text></View>
            )}
            {C.danger === "No" && <Text style={s.small}>Then your body's alarm might be louder than the actual threat. That's normal, and it's workable.</Text>}
          </View>
          <Nav />
        </>
      )}
      {C.step === 2 && (
        <>
          <Text style={s.h2}>What would you call it?</Text>
          <Text style={s.small}>Your word, not the app's. The more exact, the easier it is to handle.</Text>
          <View style={s.chips}>
            {WORDS[quad].map((w) => <Chip key={w} s={s} label={w} on={C.word === w} onPress={() => set({ word: w, own: "" })} />)}
          </View>
          <MoreWords s={s} quad={quad} C={C} set={set} />
          <TextInput style={s.input} value={C.own} onChangeText={(t) => set({ own: t, word: t })} placeholder="Or type your own word" placeholderTextColor={T.muted} />
          <Pressable onPress={() => { set({ word: "not sure yet" }); go(3); }}><Text style={s.link}>I honestly don't know, and that's fine</Text></Pressable>
          <Nav />
        </>
      )}
      {C.step === 3 && (
        <>
          <Text style={s.h2}>Pick a tool</Text>
          <Note s={s}>
            {p != null
              ? `Battery's at ${p}%${low ? `, lowest on ${low.name.toLowerCase()}` : ""}. ${p < 50 ? "Part of this feeling may be your body running on empty. Worth fixing that too." : "You've got fuel to work with."}`
              : "You haven't charged your battery today. Sleep, food and people all feed into this. You can fill it in after."}
          </Note>
          <ToolGrid s={s} onPick={(id) => { set({ tool: id }); openTool(id, () => go(4)); }} />
          <View style={s.rowBetween}>
            <Btn s={s} ghost label="Back" onPress={() => go(2)} />
            <Pressable onPress={() => { set({ after: C.feel }); go(4); }}><Text style={s.link}>I just wanted to name it</Text></Pressable>
          </View>
        </>
      )}
      {C.step === 4 && (
        <>
          <Text style={s.h2}>How does it feel now?</Text>
          <Text style={s.small}>Even a small shift counts. No shift is useful info too.</Text>
          <View style={s.card}>
            <Text style={s.b}>Feel</Text>
            <Slider minimumValue={0} maximumValue={100} value={C.after} onValueChange={(v) => set({ after: Math.round(v) })} minimumTrackTintColor={T.accent} thumbTintColor={T.accent} />
            <View style={s.rowBetween}><Text style={s.small}>Unpleasant</Text><Text style={s.small}>Pleasant</Text></View>
          </View>
          <Btn s={s} label="Save check-in" onPress={() => {
            const entry = { at: Date.now(), word: C.word, situation: C.situation, energy: C.energy, before: C.feel, after: C.after, tool: C.tool, signals: C.signals };
            update((st) => ({ ...st, checkins: [...st.checkins, entry].slice(-200) }));
            setSaved(C.after - C.feel);
            setC(freshCheck());
          }} />
        </>
      )}
    </ScrollView>
  );
}

function MoreWords({ s, quad, C, set }) {
  const [open, setOpen] = useState(false);
  const others = Object.keys(WORDS).filter((k) => k !== quad).flatMap((k) => WORDS[k]);
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => setOpen(!open)}><Text style={s.small}>{open ? "Hide extra words" : "Not quite? See more words"}</Text></Pressable>
      {open && <View style={s.chips}>{others.map((w) => <Chip key={w} s={s} label={w} on={C.word === w} onPress={() => set({ word: w, own: "" })} />)}</View>}
    </View>
  );
}

function ToolGrid({ s, onPick }) {
  return (
    <View style={s.grid}>
      {TOOLS.map((t) => (
        <Pressable key={t.id} onPress={() => onPick(t.id)} style={({ pressed }) => [s.tool, pressed && { opacity: 0.8 }]} accessibilityRole="button">
          <Text style={s.stage}>{t.stage}</Text>
          <Text style={s.h3}>{t.name}</Text>
          <Text style={s.small}>{t.desc}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------------- toolbox tab ---------------- */
function Tools({ S, update, T, s, openTool, setMorning }) {
  const p = batteryPct(S);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.h2}>Toolbox</Text>
      <Text style={s.small}>Five ways to regulate, from changing where you are to changing how you read it. Use any of them, any time.</Text>
      <ToolGrid s={s} onPick={(id) => openTool(id)} />
      {S.iam.length > 0 && (
        <View style={s.card}>
          <Label s={s}>Your I am lines</Label>
          {S.iam.map((l, i) => (
            <View key={i} style={[s.entry, s.rowBetween]}>
              <Text style={[s.body, { flex: 1 }]}>{l}</Text>
              <Pressable onPress={() => update((st) => ({ ...st, iam: st.iam.filter((_, j) => j !== i) }))}><Text style={s.link}>Remove</Text></Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={s.h3}>Morning message</Text>
            <Text style={s.small}>First open before noon.</Text>
          </View>
          <Switch value={S.morning} onValueChange={(v) => update((st) => ({ ...st, morning: v }))} trackColor={{ true: T.accent }} />
        </View>
        <Pressable onPress={() => setMorning(true)}><Text style={s.link}>Preview it</Text></Pressable>
      </View>

      <View style={s.card}>
        <Label s={s}>Full version · locked in this test</Label>
        <Text style={s.small}>This is what your home screen widget would look like:</Text>
        <View style={s.widget}>
          <BatteryCell pct={p ?? 72} T={T} size={0.45} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.label}>ICAT</Text>
            <Text style={[s.pct, { fontSize: 30 }]}>{p ?? 72}%</Text>
            <Text style={s.small}>{p == null ? "Example" : "Your battery"}</Text>
          </View>
        </View>
        {LOCKED.map((f) => (
          <View key={f.name} style={s.lockRow}>
            <Text style={s.h3}>{f.name}</Text>
            <Text style={s.small}>{f.desc}</Text>
          </View>
        ))}
      </View>
      <Footer s={s} />
    </ScrollView>
  );
}

/* ---------------- tool sheets ---------------- */
function ToolSheet({ id, onClose, s, T, update }) {
  const t = TOOLS.find((x) => x.id === id);
  const Body = { breathe: Breathe, ground: Ground, rethink: Rethink, shift: ShiftTool, iam: IAm }[id];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[s.fill, { backgroundColor: T.bg }]}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
          <View style={s.rowBetween}>
            <View style={{ flex: 1 }}>
              <Label s={s}>{t.stage}</Label>
              <Text style={s.h2}>{t.name}</Text>
            </View>
            <Pressable onPress={onClose} style={s.close} accessibilityLabel="Close"><Text style={[s.h2, { lineHeight: 26 }]}>×</Text></Pressable>
          </View>
          <Body s={s} T={T} done={onClose} update={update} />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Breathe({ s, T, done }) {
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
      if (r >= total) { setPhase("Done"); setRound(total + 1); return; }
      setRound(r + 1); setPhase("In");
      Animated.timing(scale, { toValue: 2.2, duration: reduce ? 0 : 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
      timers.current.push(setTimeout(() => {
        setPhase("Out");
        Animated.timing(scale, { toValue: 1, duration: reduce ? 0 : 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
        timers.current.push(setTimeout(() => cycle(r + 1), 6000));
      }, 4000));
    };
    cycle(0);
  };
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.body}>In through your nose for 4. Out slow for 6. A longer exhale tells your body it's safe to slow down.</Text>
      <View style={s.breath}>
        <Animated.View style={[s.ball, { transform: [{ scale }] }]} />
        <Text style={[s.h2, { color: T.accentInk }]}>{phase}</Text>
      </View>
      <Text style={[s.h3, { textAlign: "center" }]}>
        {round === 0 ? `${total} breaths` : round > total ? "Nice. Notice anything different?" : `Breath ${round} of ${total}`}
      </Text>
      {!running && <Btn s={s} label="Start" onPress={start} />}
      {round > total && <Btn s={s} label="Finish" onPress={done} />}
    </View>
  );
}

function Ground({ s, T, done }) {
  const steps = [[5, "things you can see"], [4, "things you can feel touching you"], [3, "things you can hear"], [2, "things you can smell"], [1, "slow breath"]];
  const [i, setI] = useState(0);
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.body}>Pulls your attention out of your head and into the room. Say them in your head or out loud.</Text>
      <View style={[s.card, { alignItems: "center", paddingVertical: 32 }]}>
        <Text style={[s.pct, { fontSize: 64 }]}>{steps[i][0]}</Text>
        <Text style={[s.h2, { textAlign: "center" }]}>{steps[i][1]}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {steps.map((_, j) => <View key={j} style={[s.dot, j <= i && { backgroundColor: T.accent }]} />)}
      </View>
      <Btn s={s} label={i < steps.length - 1 ? "Got them" : "Finish"} onPress={() => (i < steps.length - 1 ? setI(i + 1) : done())} />
    </View>
  );
}

function Rethink({ s, T, done, update }) {
  const prompts = [
    ["What happened, just the facts?", "e.g. I didn't get the job I applied for."],
    ["What's the story your brain is telling about it?", "e.g. I'm not good enough. I'll never get hired."],
    ["What else could it mean?", "e.g. They had 300 applicants. One no isn't a pattern."],
    ["What would you tell a friend in this spot?", "e.g. Their loss. Keep sending them out."],
    ["Is there anything useful in this?", "e.g. Now I know to tailor my resume more."],
  ];
  const [i, setI] = useState(0);
  const [ans, setAns] = useState(["", "", "", "", ""]);
  const [line, setLine] = useState("");
  const setAt = (t) => setAns((a) => a.map((x, j) => (j === i ? t : x)));
  if (i === prompts.length) {
    const take = [ans[2], ans[3], ans[4]].filter((x) => x.trim());
    return (
      <View style={{ gap: 16 }}>
        <Label s={s}>Your new take</Label>
        <View style={s.card}>
          {take.length ? take.map((x, j) => <Text key={j} style={s.body}>{x}</Text>) : <Text style={s.body}>You worked through it. Sometimes just slowing the story down is enough.</Text>}
        </View>
        <Text style={s.small}>Write it as an "I am" line to keep it?</Text>
        <TextInput style={s.input} value={line} onChangeText={setLine} placeholder="e.g. I am someone who keeps going." placeholderTextColor={T.muted} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Btn s={s} label="Save line & finish" onPress={() => { if (line.trim()) update((st) => ({ ...st, iam: [...st.iam, line.trim()] })); done(); }} />
          <Btn s={s} ghost label="Finish" onPress={done} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.body}>Same situation, different reading, different feeling. This is called reappraisal, one of the best-studied regulation skills there is.</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {prompts.map((_, j) => <View key={j} style={[s.dot, j <= i && { backgroundColor: T.accent }]} />)}
      </View>
      <Text style={s.h3}>{prompts[i][0]}</Text>
      <TextInput style={[s.input, { minHeight: 100 }]} multiline value={ans[i]} onChangeText={setAt} placeholder={prompts[i][1]} placeholderTextColor={T.muted} />
      <View style={s.rowBetween}>
        {i > 0 ? <Btn s={s} ghost label="Back" onPress={() => setI(i - 1)} /> : <View />}
        <Btn s={s} label={i < prompts.length - 1 ? "Next" : "See my new take"} onPress={() => setI(i + 1)} />
      </View>
    </View>
  );
}

function ShiftTool({ s, done }) {
  const moves = ["Step outside for 5 minutes", "Move to a different room", "Text someone I trust", "Eat something or drink water", "Do one tiny piece of it, not all of it", "Put it down until a set time", "Ask for help with it", "Leave the situation for now"];
  const [pick, setPick] = useState([]);
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.body}>Sometimes the fastest way to change a feeling is to change where you are or what's in front of you.</Text>
      <Text style={s.h3}>What's one thing you can change in the next 10 minutes?</Text>
      <View style={s.chips}>
        {moves.map((m) => <Chip key={m} s={s} label={m} on={pick.includes(m)} onPress={() => setPick(pick.includes(m) ? pick.filter((x) => x !== m) : [...pick, m])} />)}
      </View>
      {pick.length > 0 && <Note s={s}><Text style={s.b}>Plan: {pick.join(", ").toLowerCase()}.</Text> Go do it, then come back.</Note>}
      <Btn s={s} label="I'll do it" disabled={!pick.length} onPress={done} />
    </View>
  );
}

function IAm({ s, T, done, update }) {
  const starters = ["I am capable of hard things.", "I am allowed to take up space.", "I am more than one bad day.", "I am getting better at this.", "I am enough as I am right now.", "I am someone who keeps going."];
  const [v, setV] = useState("I am ");
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.body}>Short, present tense, believable. Pick one or write your own. These show up in your morning message.</Text>
      <View style={s.chips}>{starters.map((x) => <Chip key={x} s={s} label={x} on={v === x} onPress={() => setV(x)} />)}</View>
      <TextInput style={s.input} value={v} onChangeText={setV} placeholderTextColor={T.muted} />
      <Btn s={s} label="Save" onPress={() => { const l = v.trim(); if (l && l !== "I am") update((st) => ({ ...st, iam: [...st.iam, l] })); done(); }} />
    </View>
  );
}

/* ---------------- morning ---------------- */
function MorningScreen({ S, s, T, onClose }) {
  const [line] = useState(() => (S.iam.length ? S.iam[Math.floor(Math.random() * S.iam.length)] : "I am capable of hard things."));
  const msg = MORNING[new Date().getDate() % MORNING.length];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[s.fill, { backgroundColor: T.bg }]}>
        <View style={[s.page, { flex: 1, justifyContent: "center", gap: 22 }]}>
          <Label s={s}>Good morning</Label>
          <Text style={[s.h1, { fontSize: 34, lineHeight: 40 }]}>{line}</Text>
          <Text style={s.body}>{msg}</Text>
          <Btn s={s} label="Start my day" onPress={onClose} />
          <Text style={s.small}>You can turn this off in the Toolbox. In the full version this arrives as a notification.</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ---------------- feedback ---------------- */
const EMPTY_F = { helpful: 0, easy: 0, again: 0, want: [], best: "", cut: "", missing: "", other: "", name: "" };
function Feedback({ S, s, T }) {
  const [F, setF] = useState(EMPTY_F);
  const [status, setStatus] = useState("");
  const set = (p) => setF((f) => ({ ...f, ...p }));
  const Q = [["helpful", "Did it actually help you feel better or think clearer?"], ["easy", "How easy was it to use?"], ["again", "Would you open it again on your own?"]];
  const used = Object.entries(S.toolsUsed).map(([k, n]) => `${TOOLS.find((t) => t.id === k)?.name} x${n}`).join(", ") || "none";
  const text = () => [
    `ICAT feedback${F.name ? ` from ${F.name}` : ""}`,
    `Helped: ${F.helpful || "-"}/5 | Easy: ${F.easy || "-"}/5 | Use again: ${F.again || "-"}/5`,
    `Want most: ${F.want.join(", ") || "-"}`,
    `Best part: ${F.best || "-"}`,
    `Cut / ass: ${F.cut || "-"}`,
    `Missing: ${F.missing || "-"}`,
    `Other: ${F.other || "-"}`,
    `Check-ins done: ${S.checkins.length} | Tools: ${used}`,
  ].join("\n");
  const send = async () => {
    if (!F.helpful && !F.best && !F.cut && !F.missing && !F.other && !F.want.length) { setStatus("Answer at least one question first."); return; }
    try {
      const r = await Share.share({ message: text() });
      if (r.action === Share.sharedAction) { setStatus("Sent. Thank you."); setF(EMPTY_F); } else setStatus("");
    } catch (e) { setStatus("Couldn't open sharing. Screenshot this page and send it to Dag."); }
  };
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Text style={s.h2}>Be honest. Is it ass?</Text>
      <Text style={s.small}>Dag reads every one of these. Rough answers are more useful than nice ones.</Text>
      {Q.map(([k, q]) => (
        <View key={k} style={s.card}>
          <Text style={s.b}>{q}</Text>
          <Seg s={s} label={q} opts={["1", "2", "3", "4", "5"]} value={F[k] - 1} onPick={(i) => set({ [k]: i + 1 })} />
          <View style={s.rowBetween}><Text style={s.small}>Nope</Text><Text style={s.small}>Yes, a lot</Text></View>
        </View>
      ))}
      <View style={s.card}>
        <Text style={s.b}>Which locked feature would you want most?</Text>
        <View style={s.chips}>
          {LOCKED.map((f) => <Chip key={f.name} s={s} label={f.name} on={F.want.includes(f.name)} onPress={() => set({ want: F.want.includes(f.name) ? F.want.filter((x) => x !== f.name) : [...F.want, f.name] })} />)}
        </View>
      </View>
      {[["best", "Best part?"], ["cut", "What's ass / what should be cut?"], ["missing", "What's missing?"], ["other", "Anything else"], ["name", "Your name (so Dag knows who said what)"]].map(([k, l]) => (
        <View key={k} style={{ gap: 6 }}>
          <Text style={s.b}>{l}</Text>
          <TextInput style={s.input} multiline={k !== "name"} value={F[k]} onChangeText={(t) => set({ [k]: t })} placeholderTextColor={T.muted} />
        </View>
      ))}
      <Text style={s.small}>Tapping send opens your share sheet. Pick Messages and send it to Dag. It includes your answers plus counts (check-ins, tools opened), never what you wrote inside a check-in or tool.</Text>
      <Btn s={s} label="Send to Dag" onPress={send} />
      {!!status && <Text style={[s.body, { textAlign: "center" }]}>{status}</Text>}
      <Footer s={s} />
    </ScrollView>
  );
}

/* ---------------- styles ---------------- */
function makeStyles(T) {
  return StyleSheet.create({
    fill: { flex: 1 },
    page: { padding: 16, paddingBottom: 40, gap: 16 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
    wordmark: { fontSize: 24, fontWeight: "800", color: T.ink, letterSpacing: 0.5 },
    pill: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
    pillText: { fontWeight: "700", fontVariant: ["tabular-nums"] },
    h1: { fontSize: 27, lineHeight: 32, fontWeight: "800", color: T.ink },
    h2: { fontSize: 22, lineHeight: 27, fontWeight: "800", color: T.ink },
    h3: { fontSize: 16, lineHeight: 21, fontWeight: "700", color: T.ink },
    body: { fontSize: 16, lineHeight: 23, color: T.ink },
    b: { fontWeight: "700", color: T.ink, fontSize: 16 },
    small: { fontSize: 14, lineHeight: 20, color: T.muted },
    label: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: T.muted, fontWeight: "700" },
    pct: { fontSize: 42, fontWeight: "800", color: T.ink, fontVariant: ["tabular-nums"] },
    link: { color: T.accent, fontWeight: "700", textDecorationLine: "underline", fontSize: 15 },
    card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, padding: 16, gap: 12 },
    note: { backgroundColor: T.soft, borderRadius: 12, padding: 12 },
    warn: { borderLeftWidth: 4, borderLeftColor: T.low, paddingLeft: 12 },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
    btn: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", minHeight: 48, justifyContent: "center" },
    btnText: { color: T.accentInk, fontWeight: "700", fontSize: 16 },
    btnGhost: { borderWidth: 1, borderColor: T.line, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", minHeight: 48, justifyContent: "center" },
    btnGhostText: { color: T.ink, fontWeight: "700", fontSize: 16 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, borderRadius: 99, paddingVertical: 9, paddingHorizontal: 14 },
    chipOn: { backgroundColor: T.accent, borderColor: T.accent },
    chipText: { color: T.ink, fontSize: 15 },
    chipTextOn: { color: T.accentInk, fontWeight: "700" },
    seg: { flexDirection: "row", gap: 6 },
    segBtn: { flex: 1, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
    segText: { color: T.ink, fontSize: 13 },
    input: { borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, borderRadius: 12, padding: 12, fontSize: 16, color: T.ink, minHeight: 48, textAlignVertical: "top" },
    dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: T.line },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tool: { width: "48%", flexGrow: 1, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, padding: 14, gap: 4, minHeight: 112 },
    stage: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: T.accent, fontWeight: "700" },
    entry: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.line, gap: 2 },
    lockRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: T.line, gap: 2 },
    widget: { flexDirection: "row", alignItems: "center", gap: 16, alignSelf: "flex-start", width: 170, height: 170, padding: 16, borderRadius: 26, backgroundColor: T.bg, borderWidth: 1, borderColor: T.line },
    tabs: { flexDirection: "row", backgroundColor: T.surface, borderTopWidth: 1, borderTopColor: T.line },
    tabBtn: { flex: 1, alignItems: "center", paddingTop: 10, paddingBottom: 8, gap: 4 },
    tabDot: { width: 22, height: 4, borderRadius: 2, backgroundColor: "transparent" },
    tabDotOn: { backgroundColor: T.accent },
    tabText: { fontSize: 13, color: T.muted },
    tabTextOn: { color: T.accent, fontWeight: "700" },
    close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, alignItems: "center", justifyContent: "center" },
    breath: { width: 220, height: 220, borderRadius: 110, backgroundColor: T.soft, alignSelf: "center", alignItems: "center", justifyContent: "center", overflow: "hidden" },
    ball: { position: "absolute", width: 90, height: 90, borderRadius: 45, backgroundColor: T.accent },
  });
}
