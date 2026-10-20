import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { fmtDuration, miles } from '../lib/geo';
import type { RoutePlan } from '../lib/routing';
import type { Route, Stop } from '../lib/types';
import { Banner, Button, StatRow, StatusPill, StopDot } from './components';
import { color, font, radius, space, type } from './theme';

const START = {
  location: ' · from your location',
  current_stop: ' · from the stop you\'re at',
  last_stop: ' · from your last stop',
  anywhere: ' · location unavailable, starting at the best first stop',
} as const;

export function PlanSheet({ route, plan, busy, onUse, onClose }: {
  route: Route; plan: RoutePlan; busy: boolean; onUse: () => void; onClose: () => void;
}) {
  // Earlier or later than in the current order of the stops left.
  const was = new Map(plan.current.order.map((id, i) => [id, i]));
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
            ]} />
            {plan.late.length ? (
              <Banner tone="warning" icon="alert"
                title={`${plan.late.length} ${plan.late.length === 1 ? "stop can't" : "stops can't"} make the window`} meta={lateNames} />
            ) : null}
            {plan.approximate ? <Text style={type.caption}>Drive times are estimates.</Text> : null}
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: space[4] }}>
            {plan.order.map((id, i) => {
              const s = byId.get(id);
              if (!s) return null;
              const before = was.get(id) ?? i;
              const moved = before === i ? null : before > i ? 'earlier' : 'later';
              return <PlanRow key={id} stop={s} moved={moved} late={plan.late.includes(id)} />;
            })}
          </ScrollView>

          <View style={{ padding: space[4], paddingBottom: space[8], gap: space[2], borderTopWidth: 1, borderTopColor: color.divider }}>
            {same ? <Button label="Done" onPress={onUse} loading={busy} /> : (
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

function PlanRow({ stop, moved, late }: { stop: Stop; moved: 'earlier' | 'later' | null; late: boolean }) {
  const fixed = stop.status === 'en_route';
  const note = fixed ? 'On the way now' : moved ? `Moved ${moved}` : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: color.divider }}
      accessible accessibilityLabel={`${stop.customer_name}${note ? `, ${note.toLowerCase()}` : ''}${late ? ', late for the window' : ''}`}>
      <StopDot state={fixed ? 'next' : 'upcoming'} />
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{stop.customer_name}</Text>
        <Text style={type.caption} numberOfLines={1}>{note ? `${note} · ` : ''}{stop.address}</Text>
      </View>
      {late ? <StatusPill label="Late" tone="warning" /> : null}
    </View>
  );
}
