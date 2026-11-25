-- Add indexes for the two foreign-key joins flagged by Supabase performance advisor.
create index if not exists order_intents_reservation_id_idx
    on spot_grid.order_intents (reservation_id);

create index if not exists trade_outcomes_order_intent_id_idx
    on spot_grid.trade_outcomes (order_intent_id);
