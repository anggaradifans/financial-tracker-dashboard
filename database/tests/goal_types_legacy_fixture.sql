INSERT INTO auth.users VALUES (md5('goal-types-owner')::uuid), (md5('goal-types-other')::uuid);
INSERT INTO public.goals (id, user_id, kind, name, target_amount) VALUES
  (md5('legacy-custom')::uuid, md5('goal-types-owner')::uuid, 'custom', 'Legacy custom goal', 200.05),
  (md5('legacy-emergency')::uuid, md5('goal-types-owner')::uuid, 'emergency_fund', 'Legacy emergency fund', 1000.05);
INSERT INTO public.goal_contributions (id, user_id, goal_id, contributed_on, amount) VALUES
  (md5('legacy-custom-activity')::uuid, md5('goal-types-owner')::uuid, md5('legacy-custom')::uuid, '2026-10-01', 10.02),
  (md5('legacy-emergency-activity')::uuid, md5('goal-types-owner')::uuid, md5('legacy-emergency')::uuid, '2026-10-02', 20.03);
