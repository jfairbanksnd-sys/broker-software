import type { Load } from './types';
import { addHours, addMinutes, toIso } from './time';

function deriveMapLink(origin: string, dest: string) {
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(dest);
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}`;
}

function deriveTextLink(phone: string, body: string) {
  const b = encodeURIComponent(body);
  return `sms:${phone}?&body=${b}`;
}

/**
 * Extra contact fields for Phase 4:
 * - UI reads these via safe "any" accessors (no schema migration yet)
 * - We keep export typed as Load[] for the rest of the app.
 */
type LoadWithContacts = Omit<Load, 'mapLink' | 'textLink'> & {
  dispatchEmail?: string;
  driverEmail?: string;
  dispatchPhone?: string;
  driverPhone?: string;
};

function makeLoad(partial: LoadWithContacts): Load {
  const smsPhone = partial.driverPhone ?? partial.dispatchPhone ?? partial.carrierPhone;

  return {
    ...(partial as any),
    mapLink: deriveMapLink(partial.originCityState, partial.destCityState),
    textLink: deriveTextLink(smsPhone, `Load ${partial.id}: ${partial.nextAction}`),
  } as Load;
}

/**
 * Mock data notes:
 * - Times are generated relative to "now" so the dashboard sections stay meaningful.
 * - Includes multiple red/yellow to drive Action Queue.
 * - Includes dispatchEmail + driverEmail so email CTAs are enabled.
 */
export const mockLoads: Load[] = (() => {
  const now = new Date();

  return [
    // 🔴 RED: pickup window missed + GPS very stale
    makeLoad({
      id: 'L-10421',
      status: 'red',
      riskReason: 'Pickup late + GPS very stale',
      originCityState: 'Portland, OR',
      destCityState: 'Boise, ID',
      pickupWindowStartISO: toIso(addHours(now, -5)),
      pickupWindowEndISO: toIso(addHours(now, -3)),
      deliveryWindowStartISO: toIso(addHours(now, 10)),
      deliveryWindowEndISO: toIso(addHours(now, 14)),
      carrierName: 'Cascadia Haul Co.',
      carrierPhone: '+15035550111',      // dispatch/main
      dispatchPhone: '+15035550111',
      driverPhone: '+15035550911',
      dispatchEmail: 'dispatch@cascadiahaul.example',
      driverEmail: 'driver.l10421@cascadiahaul.example',
      lastGpsMinutesAgo: 205,
      nextAction: 'Call carrier: confirm pickup ETA and current location.',
    }),

    // 🔴 RED: no GPS + delivery window soon
    makeLoad({
      id: 'L-10433',
      status: 'red',
      riskReason: 'No GPS ping + delivery window soon',
      originCityState: 'Tacoma, WA',
      destCityState: 'Sacramento, CA',
      pickupWindowStartISO: toIso(addHours(now, -14)),
      pickupWindowEndISO: toIso(addHours(now, -12)),
      deliveryWindowStartISO: toIso(addHours(now, 5)),
      deliveryWindowEndISO: toIso(addHours(now, 7)),
      carrierName: 'NorthStar Freight',
      carrierPhone: '+12065550122',
      dispatchPhone: '+12065550122',
      driverPhone: '+12065550922',
      dispatchEmail: 'dispatch@northstarfreight.example',
      driverEmail: 'driver.l10433@northstarfreight.example',
      lastGpsMinutesAgo: null,
      nextAction: 'Text carrier: request immediate location/GPS update.',
    }),

    // 🔴 RED: delivery window missed
    makeLoad({
      id: 'L-10458',
      status: 'red',
      riskReason: 'Delivery window missed',
      originCityState: 'Eugene, OR',
      destCityState: 'San Jose, CA',
      pickupWindowStartISO: toIso(addHours(now, -20)),
      pickupWindowEndISO: toIso(addHours(now, -18)),
      deliveryWindowStartISO: toIso(addHours(now, -2)),
      deliveryWindowEndISO: toIso(addMinutes(now, -30)),
      carrierName: 'HighDesert Logistics',
      carrierPhone: '+15415550144',
      dispatchPhone: '+15415550144',
      driverPhone: '+15415550944',
      dispatchEmail: 'dispatch@highdesertlogistics.example',
      driverEmail: 'driver.l10458@highdesertlogistics.example',
      lastGpsMinutesAgo: 95,
      nextAction: 'Call carrier: get updated ETA and inform consignee.',
    }),

    // 🟡 YELLOW: pickup window starts soon
    makeLoad({
      id: 'L-10410',
      status: 'yellow',
      riskReason: 'Pickup window starts in 35m',
      originCityState: 'Salem, OR',
      destCityState: 'Spokane, WA',
      pickupWindowStartISO: toIso(addMinutes(now, 35)),
      pickupWindowEndISO: toIso(addHours(now, 2)),
      deliveryWindowStartISO: toIso(addHours(now, 14)),
      deliveryWindowEndISO: toIso(addHours(now, 18)),
      carrierName: 'Iron Ridge Transport',
      carrierPhone: '+15415550133',
      dispatchPhone: '+15415550133',
      driverPhone: '+15415550933',
      dispatchEmail: 'dispatch@ironridgetransport.example',
      driverEmail: 'driver.l10410@ironridgetransport.example',
      lastGpsMinutesAgo: 48,
      nextAction: 'Call carrier if no check-in by window start.',
    }),

    // 🟡 YELLOW: GPS getting stale
    makeLoad({
      id: 'L-10418',
      status: 'yellow',
      riskReason: 'GPS stale (~92m)',
      originCityState: 'Vancouver, WA',
      destCityState: 'Reno, NV',
      pickupWindowStartISO: toIso(addHours(now, -2)),
      pickupWindowEndISO: toIso(addHours(now, 1)),
      deliveryWindowStartISO: toIso(addHours(now, 18)),
      deliveryWindowEndISO: toIso(addHours(now, 22)),
      carrierName: 'Evergreen Linehaul',
      carrierPhone: '+13605550155',
      dispatchPhone: '+13605550155',
      driverPhone: '+13605550955',
      dispatchEmail: 'dispatch@evergreenlinehaul.example',
      driverEmail: 'driver.l10418@evergreenlinehaul.example',
      lastGpsMinutesAgo: 92,
      nextAction: 'Text carrier: request updated location and progress.',
    }),

    // 🟡 YELLOW: tight delivery window approaching
    makeLoad({
      id: 'L-10427',
      status: 'yellow',
      riskReason: 'Tight delivery window (approaching)',
      originCityState: 'Longview, WA',
      destCityState: 'Medford, OR',
      pickupWindowStartISO: toIso(addHours(now, 2)),
      pickupWindowEndISO: toIso(addHours(now, 4)),
      deliveryWindowStartISO: toIso(addHours(now, 9)),
      deliveryWindowEndISO: toIso(addHours(now, 10)),
      carrierName: 'Columbia Corridor',
      carrierPhone: '+13605550199',
      dispatchPhone: '+13605550199',
      driverPhone: '+13605550999',
      dispatchEmail: 'dispatch@columbiacorridor.example',
      driverEmail: 'driver.l10427@columbiacorridor.example',
      lastGpsMinutesAgo: 38,
      nextAction: 'Call carrier: confirm ETA and delivery appointment readiness.',
    }),

    // 🟢 GREEN: today
    makeLoad({
      id: 'L-10398',
      status: 'green',
      originCityState: 'Hillsboro, OR',
      destCityState: 'Seattle, WA',
      pickupWindowStartISO: toIso(addHours(now, 1)),
      pickupWindowEndISO: toIso(addHours(now, 3)),
      deliveryWindowStartISO: toIso(addHours(now, 9)),
      deliveryWindowEndISO: toIso(addHours(now, 12)),
      carrierName: 'Puget Sound Carriers',
      carrierPhone: '+12065550166',
      dispatchPhone: '+12065550166',
      driverPhone: '+12065550966',
      dispatchEmail: 'dispatch@pugetsoundcarriers.example',
      driverEmail: 'driver.l10398@pugetsoundcarriers.example',
      lastGpsMinutesAgo: 16,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN: in progress today
    makeLoad({
      id: 'L-10402',
      status: 'green',
      originCityState: 'Gresham, OR',
      destCityState: 'Bend, OR',
      pickupWindowStartISO: toIso(addHours(now, -3)),
      pickupWindowEndISO: toIso(addHours(now, -2)),
      deliveryWindowStartISO: toIso(addHours(now, 3)),
      deliveryWindowEndISO: toIso(addHours(now, 5)),
      carrierName: 'Summit Routes',
      carrierPhone: '+15035550177',
      dispatchPhone: '+15035550177',
      driverPhone: '+15035550977',
      dispatchEmail: 'dispatch@summitroutes.example',
      driverEmail: 'driver.l10402@summitroutes.example',
      lastGpsMinutesAgo: 21,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN: tomorrow-ish (next 48h)
    makeLoad({
      id: 'L-10405',
      status: 'green',
      originCityState: 'Olympia, WA',
      destCityState: 'Portland, OR',
      pickupWindowStartISO: toIso(addHours(now, 26)),
      pickupWindowEndISO: toIso(addHours(now, 28)),
      deliveryWindowStartISO: toIso(addHours(now, 34)),
      deliveryWindowEndISO: toIso(addHours(now, 36)),
      carrierName: 'Rainier Freight',
      carrierPhone: '+13605550188',
      dispatchPhone: '+13605550188',
      driverPhone: '+13605550988',
      dispatchEmail: 'dispatch@rainierfreight.example',
      driverEmail: 'driver.l10405@rainierfreight.example',
      lastGpsMinutesAgo: 12,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟢 GREEN: next 48h
    makeLoad({
      id: 'L-10407',
      status: 'green',
      originCityState: 'Spokane, WA',
      destCityState: 'Missoula, MT',
      pickupWindowStartISO: toIso(addHours(now, 40)),
      pickupWindowEndISO: toIso(addHours(now, 42)),
      deliveryWindowStartISO: toIso(addHours(now, 48)),
      deliveryWindowEndISO: toIso(addHours(now, 52)),
      carrierName: 'Mountain West Haulers',
      carrierPhone: '+15095550190',
      dispatchPhone: '+15095550190',
      driverPhone: '+15095550990',
      dispatchEmail: 'dispatch@mountainwesthaulers.example',
      driverEmail: 'driver.l10407@mountainwesthaulers.example',
      lastGpsMinutesAgo: 10,
      nextAction: 'No action needed. Monitor normally.',
    }),

    // 🟡 YELLOW: early watch item
    makeLoad({
      id: 'L-10466',
      status: 'yellow',
      riskReason: 'Early GPS staleness (watch)',
      originCityState: 'San Diego, CA',
      destCityState: 'Phoenix, AZ',
      pickupWindowStartISO: toIso(addHours(now, 6)),
      pickupWindowEndISO: toIso(addHours(now, 8)),
      deliveryWindowStartISO: toIso(addHours(now, 18)),
      deliveryWindowEndISO: toIso(addHours(now, 22)),
      carrierName: 'Southwest Express',
      carrierPhone: '+16195550123',
      dispatchPhone: '+16195550123',
      driverPhone: '+16195550923',
      dispatchEmail: 'dispatch@southwestexpress.example',
      driverEmail: 'driver.l10466@southwestexpress.example',
      lastGpsMinutesAgo: 75,
      nextAction: 'Text carrier: confirm driver assigned and tracking stable.',
    }),

    // 🟢 GREEN: beyond 48h
    makeLoad({
      id: 'L-10377',
      status: 'green',
      originCityState: 'Boise, ID',
      destCityState: 'Salt Lake City, UT',
      pickupWindowStartISO: toIso(addHours(now, 60)),
      pickupWindowEndISO: toIso(addHours(now, 62)),
      deliveryWindowStartISO: toIso(addHours(now, 72)),
      deliveryWindowEndISO: toIso(addHours(now, 76)),
      carrierName: 'Intermountain Haulers',
      carrierPhone: '+12085550110',
      dispatchPhone: '+12085550110',
      driverPhone: '+12085550910',
      dispatchEmail: 'dispatch@intermountainhaulers.example',
      driverEmail: 'driver.l10377@intermountainhaulers.example',
      lastGpsMinutesAgo: 14,
      nextAction: 'No action needed. Monitor normally.',
    }),
  ];
})();
