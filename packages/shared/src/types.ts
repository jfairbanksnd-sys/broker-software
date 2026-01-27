export type LoadStatus = 'green' | 'yellow' | 'red';

export type Load = {
  id: string;
  status: LoadStatus;
  riskReason?: string; // required if yellow/red
  originCityState: string;
  destCityState: string;

  pickupWindowStartISO: string; // ISO string
  pickupWindowEndISO: string; // ISO string
  deliveryWindowStartISO: string;
  deliveryWindowEndISO: string;

  carrierName: string;
  carrierPhone: string;

  lastGpsMinutesAgo: number | null; // null means no GPS
  nextAction: string;

  mapLink?: string; // derived ok
  textLink?: string; // derived ok
};
