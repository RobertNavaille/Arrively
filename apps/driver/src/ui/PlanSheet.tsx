import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { fmtDuration, fmtTime, fmtWindow, miles } from '../lib/geo';
import type { RoutePlan } from '../lib/routing';
import type { Route, Stop } from '../lib/types';
import { Banner, Button, StatRow, StatusPill } from './components';
import { color, font, radius, space, type } from './theme';

/** Stop numbers as the day list will show them once the plan is applied (same rule as reorder_route). */
function numbersAfter(route: Route, order: string[]) {
  const pos = new Map(route.stops.map((s) => [s.id, s.position]));
  const movable = order.filter((id) => {
    const s = route.stops.find((x) => x.id === id);
    return s && (s.status === 'scheduled' || s.status === 'queued');
  });
  const slots = movable.map((id) => pos.get(id)!).sort((a, b) => a - b);
  movable.forEach((id, i) => pos.set(id, slots[i]));
  const sorted = [...route.stops].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  return new Map(sorted.map((s, i) => [s.id, i + 1]));
}

const START = {
  location: ' · from your location',
  current_stop: ' · from the stop you\'re at',
  last_stop: ' · from your last stop',
  anywhere: ' · location unavailable, starting at the best first stop',
} as const;

export function PlanSheet({ route, plan, busy, onUse, onClose }: {
  route: Route; plan: RoutePlan; busy: boolean; onUse: () => void; onClose: () => void;
}) {
  const before = new Map(route.stops.map((s, i) => [s.id, i + 1]));
  const after = numbersAfter(route, plan.order);
  const same = plan.order.join() === plan.current.order.join();
  const savedMin = Math.round((plan.current.drive_s - plan.drive_s) / 60);
  const fewerLate = plan.current.late.length - plan.late.length;
  const byId = new Map(route.stops.map((s) => [s.id, s]));
  const lateNames = plan.late.map((id) => byId.get(id)?.customer_name).filter(Boolean).join(', ');

  const headline = same ? 'Your order is already the best'
    : savedMin >= 1 ? `Saves ${fmtDuration(savedMin)} of driving`
    : fewerLate > 0 ? `${fewerLate} fewer late ${fewerLate === 1 ? 'arrival' : 'arrivals'}`
    : 'About the same drive time';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: color.scrim, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ maxHeight: '88%', backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <View style={{ padding: space[4], paddingBottom: space[3], gap: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: color.divider, alignSelf: 'center' }} />
            <View>
              <Text style={type.caption}>Best order{START[plan.start ?? 'anywhere']}</Text>
              <Text style={type.title} accessibilityRole="header">{headline}</Text>
            </View>
            <StatRow compact items={[
              { value: fmtDuration(Math.max(1, Math.round(plan.drive_s / 60))), label: 'drive' },
              { value: miles(plan.distance_m).toFixed(1), label: 'miles' },
              { value: fmtTime(plan.finish), label: 'finish' },
            ]} />
            {plan.late.length ? (
              <Banner tone="warning" icon="alert"
                title={`${plan.late.length} ${plan.late.length === 1 ? "stop can't" : "stops can't"} make the window`} meta={lateNames} />
            ) : null}
            {plan.approximate ? <Text style={type.caption}>Drive times are estimates.</Text> : null}
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: space[4] }}>
            {plan.order.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              const n = after.get(id)!, was = before.get(id)!;
              const late = plan.late.includes(id);
              return <PlanRow key={id} stop={s} n={n} was={n !== was ? was : null} eta={plan.etas[id]} late={late} />;
            })}
          </ScrollView>

          <View style={{ padding: space[4], paddingBottom: space[8], gap: space[2], borderTopWidth: 1, borderTopColor: color.divider }}>
            {same ? <Button label="Done" onPress={onClose} /> : (
              <>
                <Button label="Use this order" onPress={onUse} loading={busy} />
                <Button variant="text" label="Keep my order" onPress={onClose} />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PlanRow({ stop, n, was, eta, late }: { stop: Stop; n: number; was: number | null; eta?: string; late: boolean }) {
  const fixed = stop.status === 'en_route';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }}
      accessible accessibilityLabel={`Stop ${n}${was ? `, was ${was}` : ''}, ${stop.customer_name}, around ${fmtTime(eta)}${late ? ', late for the window' : ''}`}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color.action, backgroundColor: fixed ? color.action : color.surface }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 11, color: fixed ? color.onAction : color.actionInk }}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{stop.customer_name}</Text>
        <Text style={type.caption} numberOfLines={1}>
          {fixed ? 'On the way now · ' : was ? `Was ${was} · ` : ''}{stop.address}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[type.bodyStrong, late && { color: color.warning }]}>{fmtTime(eta)}</Text>
        {late ? <StatusPill label="Late" tone="warning" /> : <Text style={type.caption}>{fmtWindow(stop)}</Text>}
      </View>
    </View>
  );
}
