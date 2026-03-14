;; BitLegacy - guardian.clar
;; 2-of-3 guardian confirmation before inheritance release

(define-constant ERR-NOT-GUARDIAN (err u200))
(define-constant ERR-ALREADY-CONFIRMED (err u201))
(define-constant ERR-NO-PANEL (err u202))
(define-constant ERR-ALREADY-EXISTS (err u203))
(define-constant ERR-THRESHOLD-NOT-MET (err u204))

(define-constant CONFIRMATION-THRESHOLD u2)

(define-map guardian-panels
  { estate-owner: principal }
  {
    guardians:    (list 3 principal),
    confirmations: (list 3 bool),
    confirmed:    bool,
    created-at:   uint
  }
)

(define-map guardian-index
  { guardian: principal, estate-owner: principal }
  { idx: uint }
)

;; Estate owner registers their guardian panel
(define-public (register-guardians
    (estate-owner principal)
    (g1 principal)
    (g2 principal)
    (g3 principal)
  )
  (begin
    (asserts! (is-eq tx-sender estate-owner) ERR-NOT-GUARDIAN)
    (asserts! (is-none (map-get? guardian-panels { estate-owner: estate-owner })) ERR-ALREADY-EXISTS)
    (map-set guardian-panels { estate-owner: estate-owner }
      {
        guardians:     (list g1 g2 g3),
        confirmations: (list false false false),
        confirmed:     false,
        created-at:    stacks-block-time
      }
    )
    (map-set guardian-index { guardian: g1, estate-owner: estate-owner } { idx: u0 })
    (map-set guardian-index { guardian: g2, estate-owner: estate-owner } { idx: u1 })
    (map-set guardian-index { guardian: g3, estate-owner: estate-owner } { idx: u2 })
    (print { event: "guardians-registered", owner: estate-owner, g1: g1, g2: g2, g3: g3 })
    (ok true)
  )
)

;; Guardian confirms estate should be released
(define-public (confirm-release (estate-owner principal))
  (let (
    (panel      (unwrap! (map-get? guardian-panels { estate-owner: estate-owner }) ERR-NO-PANEL))
    (guardian   tx-sender)
    (entry      (unwrap! (map-get? guardian-index { guardian: guardian, estate-owner: estate-owner }) ERR-NOT-GUARDIAN))
    (idx        (get idx entry))
    (confs      (get confirmations panel))
    (new-confs  (update-confirmation confs idx))
    (conf-count (fold count-true new-confs u0))
    (threshold-met (>= conf-count CONFIRMATION-THRESHOLD))
  )
    (asserts! (not (get confirmed panel)) ERR-ALREADY-CONFIRMED)
    (map-set guardian-panels { estate-owner: estate-owner }
      (merge panel {
        confirmations: new-confs,
        confirmed:     threshold-met
      })
    )
    (print { event: "guardian-confirmed", guardian: guardian, owner: estate-owner, count: conf-count })
    (ok threshold-met)
  )
)

(define-private (update-confirmation (confs (list 3 bool)) (idx uint))
  (list
    (if (is-eq idx u0) true (unwrap-panic (element-at? confs u0)))
    (if (is-eq idx u1) true (unwrap-panic (element-at? confs u1)))
    (if (is-eq idx u2) true (unwrap-panic (element-at? confs u2)))
  )
)

(define-private (count-true (b bool) (acc uint))
  (if b (+ acc u1) acc)
)

(define-read-only (get-panel (estate-owner principal))
  (map-get? guardian-panels { estate-owner: estate-owner })
)

(define-read-only (is-panel-confirmed (estate-owner principal))
  (match (map-get? guardian-panels { estate-owner: estate-owner })
    panel (ok (get confirmed panel))
    ERR-NO-PANEL
  )
)

(define-read-only (get-confirmation-count (estate-owner principal))
  (match (map-get? guardian-panels { estate-owner: estate-owner })
    panel (ok (fold count-true (get confirmations panel) u0))
    ERR-NO-PANEL
  )
)
