(module
  (memory (export "memory") 96)

  ;; Static JSON string fragments at 0..320
  (data (i32.const 0) "{\"code\":\"stray_cr\",\"line\":")
  (data (i32.const 26) "{\"code\":\"quote_junk\",\"line\":")
  (data (i32.const 54) "{\"code\":\"unterminated_quote\",\"line\":")
  (data (i32.const 90) "{\"code\":\"short_row\",\"line\":")
  (data (i32.const 117) "{\"code\":\"long_row\",\"line\":")
  (data (i32.const 143) ",\"row\":null}")
  (data (i32.const 155) ",\"row\":")
  (data (i32.const 162) ",\"fields\":")
  (data (i32.const 172) ",\"extra\":[")
  (data (i32.const 182) "{\"columns\":null,\"rows\":[")
  (data (i32.const 206) "{\"columns\":     ")
  (data (i32.const 222) ",\"rows\":[")
  (data (i32.const 231) "],\"errors\":[")
  (data (i32.const 243) "{\"columns\":[],\"rows\":[],\"errors\":[")
  (data (i32.const 277) "{\"columns\":null,\"rows\":[],\"errors\":[")

  ;; State block at 512..560:
  ;; 512: out_p (next src p), 516: out_op (op end in outBuf), 520: line, 524: width,
  ;; 528: columns_done, 532: row_count, 536: eop, 540: extra_op, 544: row0_len,
  ;; 548: bom_checked, 552: status (0=need_more, 1=case_done, -1=fallback), 556: header
  (global $fs_base i32 (i32.const 1024))
  (global $row0_base i32 (i32.const 66560))
  (global $row0_limit i32 (i32.const 131072))
  (global $in_base i32 (i32.const 132096))
  (global $out_base i32 (i32.const 264192))
  (global $out_limit i32 (i32.const 920000))
  (global $extra_base i32 (i32.const 930000))
  (global $extra_limit i32 (i32.const 1970000))
  (global $err_base i32 (i32.const 1980000))
  (global $err_limit i32 (i32.const 6180000))

  (func (export "reset_case")
    (i32.store (i32.const 516) (global.get $out_base)) ;; op
    (i32.store (i32.const 520) (i32.const 1))   ;; line = 1
    (i32.store (i32.const 524) (i32.const -1))  ;; width = -1
    (i32.store (i32.const 528) (i32.const 0))   ;; columns_done = 0
    (i32.store (i32.const 532) (i32.const 0))   ;; row_count = 0
    (i32.store (i32.const 536) (global.get $err_base))
    (i32.store (i32.const 540) (global.get $extra_base))
    (i32.store (i32.const 544) (i32.const 0))   ;; row0_len = 0
    (i32.store (i32.const 548) (i32.const 0))   ;; bom_checked = 0
    (i32.store (i32.const 552) (i32.const 0))   ;; status = 0
    (i32.store (i32.const 556) (i32.const 0))   ;; header = 0
  )

  ;; Record a 20-byte binary error at $eop: (code, line, raw_row, a, b)
  (func $rec_err (param $eop i32) (param $code i32) (param $line i32) (param $raw_row i32) (param $a i32) (param $b i32) (result i32)
    (if (i32.gt_u (i32.add (local.get $eop) (i32.const 20)) (global.get $err_limit))
      (then (return (i32.const -1)))
    )
    (i32.store (local.get $eop) (local.get $code))
    (i32.store (i32.add (local.get $eop) (i32.const 4)) (local.get $line))
    (i32.store (i32.add (local.get $eop) (i32.const 8)) (local.get $raw_row))
    (i32.store (i32.add (local.get $eop) (i32.const 12)) (local.get $a))
    (i32.store (i32.add (local.get $eop) (i32.const 16)) (local.get $b))
    (i32.add (local.get $eop) (i32.const 20))
  )

  (func $write_uint (param $dst i32) (param $val i32) (result i32)
    (local $d0 i32) (local $q i32) (local $l i32) (local $r i32) (local $t i32)
    (if (i32.eqz (local.get $val))
      (then
        (i32.store8 (local.get $dst) (i32.const 0x30))
        (return (i32.add (local.get $dst) (i32.const 1)))
      )
    )
    (local.set $d0 (local.get $dst))
    (loop $dig
      (local.set $q (i32.div_u (local.get $val) (i32.const 10)))
      (i32.store8
        (local.get $dst)
        (i32.add (i32.const 0x30) (i32.sub (local.get $val) (i32.mul (local.get $q) (i32.const 10))))
      )
      (local.set $dst (i32.add (local.get $dst) (i32.const 1)))
      (local.set $val (local.get $q))
      (br_if $dig (i32.gt_u (local.get $val) (i32.const 0)))
    )
    (local.set $l (local.get $d0))
    (local.set $r (i32.sub (local.get $dst) (i32.const 1)))
    (block $rev_done
      (loop $rev
        (br_if $rev_done (i32.ge_u (local.get $l) (local.get $r)))
        (local.set $t (i32.load8_u (local.get $l)))
        (i32.store8 (local.get $l) (i32.load8_u (local.get $r)))
        (i32.store8 (local.get $r) (local.get $t))
        (local.set $l (i32.add (local.get $l) (i32.const 1)))
        (local.set $r (i32.sub (local.get $r) (i32.const 1)))
        (br $rev)
      )
    )
    (local.get $dst)
  )

  ;; Format all binary errors into JSON starting at mem[516] ($op) and close with ]}
  ;; Returns total end op, or -1 if out_limit exceeded
  (func (export "finish_case") (param $header i32) (param $lead i32) (result i32)
    (local $op i32)
    (local $ep i32)
    (local $eop i32)
    (local $code i32)
    (local $line i32)
    (local $row i32)
    (local $a i32)
    (local $b i32)
    (local $columns_done i32)
    (local $row0_len i32)

    (local.set $op (i32.load (i32.const 516)))
    (local.set $columns_done (i32.load (i32.const 528)))
    (local.set $row0_len (i32.load (i32.const 544)))

    (if (i32.gt_u (i32.add (local.get $op) (i32.const 64)) (global.get $out_limit))
      (then (return (i32.const -1)))
    )

    (if (i32.eqz (local.get $columns_done))
      (then
        ;; Empty CSV: write lead ('[' or ',') + {"columns":[],"rows":[],"errors":[ or null version
        (if (local.get $lead)
          (then
            (i32.store8 (local.get $op) (local.get $lead))
            (local.set $op (i32.add (local.get $op) (i32.const 1)))
          )
        )
        (if (local.get $header)
          (then
            (memory.copy (local.get $op) (i32.const 243) (i32.const 34))
            (local.set $op (i32.add (local.get $op) (i32.const 34)))
          )
          (else
            (memory.copy (local.get $op) (i32.const 277) (i32.const 36))
            (local.set $op (i32.add (local.get $op) (i32.const 36)))
          )
        )
      )
      (else
        (memory.copy (local.get $op) (i32.const 231) (i32.const 12))
        (local.set $op (i32.add (local.get $op) (i32.const 12)))
      )
    )

    (local.set $ep (global.get $err_base))
    (local.set $eop (i32.load (i32.const 536)))
    (block $err_done
      (loop $err_loop
        (br_if $err_done (i32.ge_u (local.get $ep) (local.get $eop)))
        (local.set $code (i32.load (local.get $ep)))
        (local.set $line (i32.load (i32.add (local.get $ep) (i32.const 4))))
        (local.set $row (i32.sub (i32.load (i32.add (local.get $ep) (i32.const 8))) (local.get $header)))
        (local.set $a (i32.load (i32.add (local.get $ep) (i32.const 12))))
        (local.set $b (i32.load (i32.add (local.get $ep) (i32.const 16))))

        (if (i32.gt_u (i32.add (local.get $op) (i32.add (if (result i32) (i32.eq (local.get $code) (i32.const 4)) (then (local.get $b)) (else (i32.const 0))) (i32.const 128))) (global.get $out_limit))
          (then (return (i32.const -1)))
        )

        (if (i32.gt_u (local.get $ep) (global.get $err_base))
          (then
            (i32.store8 (local.get $op) (i32.const 0x2c))
            (local.set $op (i32.add (local.get $op) (i32.const 1)))
          )
        )

        (if (i32.eq (local.get $code) (i32.const 0))
          (then (memory.copy (local.get $op) (i32.const 0) (i32.const 26)) (local.set $op (i32.add (local.get $op) (i32.const 26))))
          (else (if (i32.eq (local.get $code) (i32.const 1))
            (then (memory.copy (local.get $op) (i32.const 26) (i32.const 28)) (local.set $op (i32.add (local.get $op) (i32.const 28))))
            (else (if (i32.eq (local.get $code) (i32.const 2))
              (then (memory.copy (local.get $op) (i32.const 54) (i32.const 36)) (local.set $op (i32.add (local.get $op) (i32.const 36))))
              (else (if (i32.eq (local.get $code) (i32.const 3))
                (then (memory.copy (local.get $op) (i32.const 90) (i32.const 27)) (local.set $op (i32.add (local.get $op) (i32.const 27))))
                (else (memory.copy (local.get $op) (i32.const 117) (i32.const 26)) (local.set $op (i32.add (local.get $op) (i32.const 26))))
              ))
            ))
          ))
        )

        (local.set $op (call $write_uint (local.get $op) (local.get $line)))
        (if (i32.lt_s (local.get $row) (i32.const 0))
          (then
            (if (i32.lt_u (local.get $code) (i32.const 3))
              (then
                (memory.copy (local.get $op) (i32.const 143) (i32.const 12))
                (local.set $op (i32.add (local.get $op) (i32.const 12)))
                (local.set $ep (i32.add (local.get $ep) (i32.const 20)))
                (br $err_loop)
              )
              (else
                ;; ,"row":null
                (memory.copy (local.get $op) (i32.const 143) (i32.const 11))
                (local.set $op (i32.add (local.get $op) (i32.const 11)))
              )
            )
          )
          (else
            (memory.copy (local.get $op) (i32.const 155) (i32.const 7))
            (local.set $op (i32.add (local.get $op) (i32.const 7)))
            (local.set $op (call $write_uint (local.get $op) (local.get $row)))
            (if (i32.lt_u (local.get $code) (i32.const 3))
              (then
                (i32.store8 (local.get $op) (i32.const 0x7d))
                (local.set $op (i32.add (local.get $op) (i32.const 1)))
                (local.set $ep (i32.add (local.get $ep) (i32.const 20)))
                (br $err_loop)
              )
            )
          )
        )

        (if (i32.eq (local.get $code) (i32.const 3))
          (then
            (memory.copy (local.get $op) (i32.const 162) (i32.const 10))
            (local.set $op (i32.add (local.get $op) (i32.const 10)))
            (local.set $op (call $write_uint (local.get $op) (local.get $a)))
            (i32.store8 (local.get $op) (i32.const 0x7d))
            (local.set $op (i32.add (local.get $op) (i32.const 1)))
          )
          (else
            (memory.copy (local.get $op) (i32.const 172) (i32.const 10))
            (local.set $op (i32.add (local.get $op) (i32.const 10)))
            (memory.copy (local.get $op) (local.get $a) (local.get $b))
            (local.set $op (i32.add (local.get $op) (local.get $b)))
            (i32.store16 (local.get $op) (i32.const 0x7d5d))
            (local.set $op (i32.add (local.get $op) (i32.const 2)))
          )
        )

        (local.set $ep (i32.add (local.get $ep) (i32.const 20)))
        (br $err_loop)
      )
    )

    (i32.store16 (local.get $op) (i32.const 0x7d5d))
    (i32.add (local.get $op) (i32.const 2))
  )

  ;; Write lead ('[' or ',') + row0 prefix (1 + row0_len + 25 bytes) at $out_base
  (func (export "build_prefix") (param $header i32) (param $lead i32) (result i32)
    (local $op i32)
    (local $row0_len i32)
    (local $row_count i32)
    (local.set $op (global.get $out_base))
    (if (local.get $lead)
      (then
        (i32.store8 (local.get $op) (local.get $lead))
        (local.set $op (i32.add (local.get $op) (i32.const 1)))
      )
    )
    (local.set $row0_len (i32.load (i32.const 544)))
    (local.set $row_count (i32.load (i32.const 532)))
    (if (local.get $header)
      (then
        (memory.copy (local.get $op) (i32.const 206) (i32.const 16))
        (local.set $op (i32.add (local.get $op) (i32.const 16)))
        (memory.copy (local.get $op) (global.get $row0_base) (local.get $row0_len))
        (local.set $op (i32.add (local.get $op) (local.get $row0_len)))
        (memory.copy (local.get $op) (i32.const 222) (i32.const 9))
        (local.set $op (i32.add (local.get $op) (i32.const 9)))
      )
      (else
        (memory.copy (local.get $op) (i32.const 182) (i32.const 24))
        (local.set $op (i32.add (local.get $op) (i32.const 24)))
        (memory.copy (local.get $op) (global.get $row0_base) (local.get $row0_len))
        (local.set $op (i32.add (local.get $op) (local.get $row0_len)))
        (i32.store8 (local.get $op) (if (result i32) (i32.gt_s (local.get $row_count) (i32.const 0)) (then (i32.const 0x2c)) (else (i32.const 0x20))))
        (local.set $op (i32.add (local.get $op) (i32.const 1)))
      )
    )
    (local.get $op)
  )

  ;; Process a chunk of cases.json starting inside a JSON "text":"..." field at $src_start up to $src_end.
  ;; is_eof = 1 if file ends at $src_end.
  ;; Updates state at 512..560.
  ;; State 552: 0 = need_more (p at 512, op at 516), 1 = case_done (nextSearch at 512, op at 516, header at 556), -1 = fallback
  (func (export "process_chunk") (param $src_start i32) (param $src_end i32) (param $is_eof i32)
    (local $p i32)
    (local $op i32)
    (local $eop i32)
    (local $extra_op i32)
    (local $line i32)
    (local $width i32)
    (local $columns_done i32)
    (local $row_count i32)
    (local $record_start_p i32)
    (local $record_line i32)
    (local $record_row i32)
    (local $row_start_op i32)
    (local $row_start_eop i32)
    (local $row_start_extra i32)
    (local $flen i32)
    (local $first_quoted i32)
    (local $is_quoted i32)
    (local $field_data_start i32)
    (local $open i32)
    (local $open_line i32)
    (local $closed i32)
    (local $junk_mode i32)
    (local $junk_added i32)
    (local $b i32)
    (local $b2 i32)
    (local $mask i32)
    (local $tz i32)
    (local $v v128)
    (local $splat_bs v128)
    (local $splat_comma v128)
    (local $splat_quote v128)
    (local $empty_row_op i32)
    (local $k i32)
    (local $cut_start i32)
    (local $slice_len i32)
    (local $is_row0 i32)
    (local $buf_limit i32)
    (local $hit_case_end i32)
    (local $need_more i32)
    (local $soft_p_limit i32)

    (local.set $p (local.get $src_start))
    (local.set $op (i32.load (i32.const 516)))
    (local.set $eop (i32.load (i32.const 536)))
    (local.set $extra_op (i32.load (i32.const 540)))
    (local.set $line (i32.load (i32.const 520)))
    (local.set $width (i32.load (i32.const 524)))
    (local.set $columns_done (i32.load (i32.const 528)))
    (local.set $row_count (i32.load (i32.const 532)))
    (local.set $hit_case_end (i32.const 0))
    (local.set $need_more (i32.const 0))

    (local.set $splat_bs (i8x16.splat (i32.const 0x5c)))
    (local.set $splat_comma (i8x16.splat (i32.const 0x2c)))
    (local.set $splat_quote (i8x16.splat (i32.const 0x22)))

    ;; Soft stop threshold if not EOF: stop cleanly between rows near end of chunk
    (local.set $soft_p_limit
      (if (result i32) (local.get $is_eof)
        (then (local.get $src_end))
        (else (i32.sub (local.get $src_end) (i32.const 2048)))
      )
    )

    ;; Check BOM once at start of case
    (if (i32.eqz (i32.load (i32.const 548)))
      (then
        (if (i32.and (i32.eqz (local.get $is_eof)) (i32.lt_u (i32.sub (local.get $src_end) (local.get $p)) (i32.const 8)))
          (then
            (i32.store (i32.const 512) (local.get $p))
            (i32.store (i32.const 516) (local.get $op))
            (i32.store (i32.const 552) (i32.const 0))
            (return)
          )
        )
        (i32.store (i32.const 548) (i32.const 1))
        (if (i32.and
              (i32.le_u (i32.add (local.get $p) (i32.const 3)) (local.get $src_end))
              (i32.and
                (i32.eq (i32.load8_u (local.get $p)) (i32.const 0xef))
                (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 1))) (i32.const 0xbfbb))
              )
            )
          (then (local.set $p (i32.add (local.get $p) (i32.const 3))))
          (else
            (if (i32.and
                  (i32.le_u (i32.add (local.get $p) (i32.const 6)) (local.get $src_end))
                  (i32.and
                    (i32.eq (i32.load16_u (local.get $p)) (i32.const 0x755c))
                    (i32.and
                      (i32.eq (i32.or (i32.load8_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x20)) (i32.const 0x66))
                      (i32.and
                        (i32.eq (i32.or (i32.load8_u (i32.add (local.get $p) (i32.const 3))) (i32.const 0x20)) (i32.const 0x65))
                        (i32.and
                          (i32.eq (i32.or (i32.load8_u (i32.add (local.get $p) (i32.const 4))) (i32.const 0x20)) (i32.const 0x66))
                          (i32.eq (i32.or (i32.load8_u (i32.add (local.get $p) (i32.const 5))) (i32.const 0x20)) (i32.const 0x66))
                        )
                      )
                    )
                  )
                )
              (then (local.set $p (i32.add (local.get $p) (i32.const 6))))
            )
          )
        )
      )
    )

    ;; Outer record loop
    (block $outer_done
      (loop $outer
        ;; Skip blank lines (\n or \r\n)
        (block $skip_done
          (loop $skip
            (if (i32.ge_u (local.get $p) (local.get $src_end))
              (then
                (if (local.get $is_eof)
                  (then (i32.store (i32.const 552) (i32.const -1)) (return))
                )
                (local.set $need_more (i32.const 1))
                (br $outer_done)
              )
            )
            (local.set $b (i32.load8_u (local.get $p)))
            (if (i32.eq (local.get $b) (i32.const 0x22))
              (then
                (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 18)) (local.get $src_end)))
                  (then (local.set $need_more (i32.const 1)) (br $outer_done))
                )
                (local.set $hit_case_end (i32.const 1))
                (br $outer_done)
              )
            )
            (br_if $skip_done (i32.ne (local.get $b) (i32.const 0x5c)))
            (if (i32.ge_u (i32.add (local.get $p) (i32.const 1)) (local.get $src_end))
              (then
                (if (local.get $is_eof) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                (local.set $need_more (i32.const 1))
                (br $outer_done)
              )
            )
            (local.set $b2 (i32.load8_u (i32.add (local.get $p) (i32.const 1))))
            (if (i32.eq (local.get $b2) (i32.const 0x6e))
              (then
                (local.set $p (i32.add (local.get $p) (i32.const 2)))
                (local.set $line (i32.add (local.get $line) (i32.const 1)))
                (br $skip)
              )
            )
            (if (i32.eq (local.get $b2) (i32.const 0x72))
              (then
                (if (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                  (then
                    (if (i32.eqz (local.get $is_eof))
                      (then (local.set $need_more (i32.const 1)) (br $outer_done))
                    )
                  )
                  (else
                    (if (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x6e5c))
                      (then
                        (local.set $p (i32.add (local.get $p) (i32.const 4)))
                        (local.set $line (i32.add (local.get $line) (i32.const 1)))
                        (br $skip)
                      )
                    )
                  )
                )
              )
            )
            (br $skip_done)
          )
        )

        ;; Soft-pause check cleanly at record start if past chunk soft limit or out buffer > 200 KB
        (if (i32.and
              (i32.eqz (local.get $is_eof))
              (i32.or (i32.ge_u (local.get $p) (local.get $soft_p_limit)) (i32.gt_u (local.get $op) (i32.const 465000)))
            )
          (then
            (local.set $need_more (i32.const 1))
            (br $outer_done)
          )
        )

        ;; Save rollback checkpoint for this record
        (local.set $record_start_p (local.get $p))
        (local.set $record_line (local.get $line))
        (local.set $is_row0 (i32.eqz (local.get $columns_done)))
        (local.set $record_row
          (if (result i32) (local.get $is_row0)
            (then (i32.const 0))
            (else (i32.add (local.get $row_count) (i32.const 1)))
          )
        )
        (local.set $row_start_op (local.get $op))
        (local.set $row_start_eop (local.get $eop))
        (local.set $row_start_extra (local.get $extra_op))

        ;; If row 0, redirect $op temporarily to $row0_base!
        (if (local.get $is_row0)
          (then
            (local.set $op (global.get $row0_base))
            (local.set $buf_limit (global.get $row0_limit))
          )
          (else
            (local.set $buf_limit (global.get $out_limit))
            (if (i32.gt_s (local.get $row_count) (i32.const 0))
              (then
                (i32.store8 (local.get $op) (i32.const 0x2c))
                (local.set $op (i32.add (local.get $op) (i32.const 1)))
              )
            )
          )
        )
        (i32.store8 (local.get $op) (i32.const 0x5b))
        (local.set $op (i32.add (local.get $op) (i32.const 1)))

        (local.set $flen (i32.const 0))
        (local.set $first_quoted (i32.const 0))

        ;; Field loop
        (block $field_done
          (loop $field_loop
            (if (i32.ge_u (local.get $flen) (i32.const 16384))
              (then (i32.store (i32.const 552) (i32.const -1)) (return))
            )
            (if (i32.gt_u (i32.add (local.get $op) (i32.const 64)) (local.get $buf_limit))
              (then
                (if (local.get $is_row0)
                  (then (i32.store (i32.const 552) (i32.const -1)) (return))
                )
                ;; Flush before this record! Rewind record and return need_more
                (local.set $p (local.get $record_start_p))
                (local.set $op (local.get $row_start_op))
                (local.set $eop (local.get $row_start_eop))
                (local.set $extra_op (local.get $row_start_extra))
                (local.set $line (local.get $record_line))
                (local.set $need_more (i32.const 1))
                (br $outer_done)
              )
            )
            (if (i32.gt_u (local.get $flen) (i32.const 0))
              (then
                (i32.store8 (local.get $op) (i32.const 0x2c))
                (local.set $op (i32.add (local.get $op) (i32.const 1)))
              )
            )

            (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 2)) (local.get $src_end)))
              (then
                (local.set $p (local.get $record_start_p))
                (local.set $op (local.get $row_start_op))
                (local.set $eop (local.get $row_start_eop))
                (local.set $extra_op (local.get $row_start_extra))
                (local.set $line (local.get $record_line))
                (local.set $need_more (i32.const 1))
                (br $outer_done)
              )
            )

            (local.set $is_quoted
              (i32.and
                (i32.le_u (i32.add (local.get $p) (i32.const 2)) (local.get $src_end))
                (i32.eq (i32.load16_u (local.get $p)) (i32.const 0x225c))
              )
            )
            (if (i32.eqz (local.get $flen))
              (then (local.set $first_quoted (local.get $is_quoted)))
            )
            (i32.store
              (i32.add (global.get $fs_base) (i32.shl (local.get $flen) (i32.const 2)))
              (local.get $op)
            )
            (local.set $flen (i32.add (local.get $flen) (i32.const 1)))
            (i32.store8 (local.get $op) (i32.const 0x22))
            (local.set $op (i32.add (local.get $op) (i32.const 1)))
            (local.set $field_data_start (local.get $op))

            (local.set $junk_mode (i32.const 0))
            (local.set $junk_added (i32.const 0))

            (block $enter_unquoted
              (if (local.get $is_quoted)
                (then
                  (local.set $open (local.get $p))
                  (local.set $open_line (local.get $line))
                  (local.set $p (i32.add (local.get $p) (i32.const 2)))
                  (local.set $closed (i32.const 0))

                  ;; Quoted SIMD loop: stop on 0x5c (\) OR 0x22 (")
                  (block $q_simd_done
                    (loop $q_simd
                      (br_if $q_simd_done (i32.gt_u (i32.add (local.get $p) (i32.const 16)) (local.get $src_end)))
                      (if (i32.and (local.get $is_row0) (i32.gt_u (i32.add (local.get $op) (i32.const 32)) (local.get $buf_limit)))
                        (then (i32.store (i32.const 552) (i32.const -1)) (return))
                      )
                      (local.set $v (v128.load (local.get $p)))
                      (v128.store (local.get $op) (local.get $v))
                      (local.set $mask
                        (i8x16.bitmask
                          (v128.or
                            (i8x16.eq (local.get $v) (local.get $splat_bs))
                            (i8x16.eq (local.get $v) (local.get $splat_quote))
                          )
                        )
                      )
                      (if (i32.eqz (local.get $mask))
                        (then
                          (local.set $p (i32.add (local.get $p) (i32.const 16)))
                          (local.set $op (i32.add (local.get $op) (i32.const 16)))
                          (br $q_simd)
                        )
                      )
                      (local.set $tz (i32.ctz (local.get $mask)))
                      (local.set $p (i32.add (local.get $p) (local.get $tz)))
                      (local.set $op (i32.add (local.get $op) (local.get $tz)))

                      (local.set $b (i32.load8_u (local.get $p)))
                      (if (i32.eq (local.get $b) (i32.const 0x22))
                        (then
                          ;; Hit bare " (end of case text!) with unclosed quote
                          (local.set $hit_case_end (i32.const 1))
                          (br $q_simd_done)
                        )
                      )
                      ;; $b == 0x5c
                      (if (i32.ge_u (i32.add (local.get $p) (i32.const 1)) (local.get $src_end))
                        (then (br $q_simd_done))
                      )
                      (local.set $b2 (i32.load8_u (i32.add (local.get $p) (i32.const 1))))
                      (if (i32.eq (local.get $b2) (i32.const 0x22))
                        (then
                          (if (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                            (then
                              (if (i32.eqz (local.get $is_eof))
                                (then
                                  (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                                  (local.set $need_more (i32.const 1)) (br $outer_done)
                                )
                              )
                            )
                          )
                          (if (i32.and
                                (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                                (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x225c))
                              )
                            (then
                              (i32.store16 (local.get $op) (i32.const 0x225c))
                              (local.set $op (i32.add (local.get $op) (i32.const 2)))
                              (local.set $p (i32.add (local.get $p) (i32.const 4)))
                              (br $q_simd)
                            )
                          )
                          (local.set $p (i32.add (local.get $p) (i32.const 2)))
                          (local.set $closed (i32.const 1))
                          (br $q_simd_done)
                        )
                      )
                      (if (i32.eq (local.get $b2) (i32.const 0x72))
                        (then
                          (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end)))
                            (then
                              (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                              (local.set $need_more (i32.const 1)) (br $outer_done)
                            )
                          )
                          (i32.store16 (local.get $op) (i32.const 0x6e5c))
                          (local.set $op (i32.add (local.get $op) (i32.const 2)))
                          (local.set $line (i32.add (local.get $line) (i32.const 1)))
                          (if (i32.and
                                (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                                (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x6e5c))
                              )
                            (then (local.set $p (i32.add (local.get $p) (i32.const 4))))
                            (else (local.set $p (i32.add (local.get $p) (i32.const 2))))
                          )
                          (br $q_simd)
                        )
                      )
                      (if (i32.eq (local.get $b2) (i32.const 0x6e))
                        (then
                          (i32.store16 (local.get $op) (i32.const 0x6e5c))
                          (local.set $op (i32.add (local.get $op) (i32.const 2)))
                          (local.set $p (i32.add (local.get $p) (i32.const 2)))
                          (local.set $line (i32.add (local.get $line) (i32.const 1)))
                          (br $q_simd)
                        )
                      )
                      (if (i32.or (i32.eq (local.get $b2) (i32.const 0x75)) (i32.eq (local.get $b2) (i32.const 0x2f)))
                        (then (i32.store (i32.const 552) (i32.const -1)) (return))
                      )
                      (i32.store8 (local.get $op) (i32.const 0x5c))
                      (i32.store8 (i32.add (local.get $op) (i32.const 1)) (local.get $b2))
                      (local.set $op (i32.add (local.get $op) (i32.const 2)))
                      (local.set $p (i32.add (local.get $p) (i32.const 2)))
                      (br $q_simd)
                    )
                  )

                  ;; Quoted scalar tail
                  (if (i32.and (i32.eqz (local.get $closed)) (i32.eqz (local.get $hit_case_end)))
                    (then
                      (block $q_tail_done
                        (loop $q_tail
                          (br_if $q_tail_done (i32.ge_u (local.get $p) (local.get $src_end)))
                          (if (i32.gt_u (i32.add (local.get $op) (i32.const 16)) (local.get $buf_limit))
                            (then
                              (if (local.get $is_row0) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                              (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                              (local.set $need_more (i32.const 1)) (br $outer_done)
                            )
                          )
                          (local.set $b (i32.load8_u (local.get $p)))
                          (if (i32.eq (local.get $b) (i32.const 0x22))
                            (then (local.set $hit_case_end (i32.const 1)) (br $q_tail_done))
                          )
                          (if (i32.ne (local.get $b) (i32.const 0x5c))
                            (then
                              (i32.store8 (local.get $op) (local.get $b))
                              (local.set $op (i32.add (local.get $op) (i32.const 1)))
                              (local.set $p (i32.add (local.get $p) (i32.const 1)))
                              (br $q_tail)
                            )
                          )
                          (if (i32.ge_u (i32.add (local.get $p) (i32.const 1)) (local.get $src_end))
                            (then (br $q_tail_done))
                          )
                          (local.set $b2 (i32.load8_u (i32.add (local.get $p) (i32.const 1))))
                          (if (i32.eq (local.get $b2) (i32.const 0x22))
                            (then
                              (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end)))
                                (then
                                  (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                                  (local.set $need_more (i32.const 1)) (br $outer_done)
                                )
                              )
                              (if (i32.and
                                    (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                                    (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x225c))
                                  )
                                (then
                                  (i32.store16 (local.get $op) (i32.const 0x225c))
                                  (local.set $op (i32.add (local.get $op) (i32.const 2)))
                                  (local.set $p (i32.add (local.get $p) (i32.const 4)))
                                  (br $q_tail)
                                )
                              )
                              (local.set $p (i32.add (local.get $p) (i32.const 2)))
                              (local.set $closed (i32.const 1))
                              (br $q_tail_done)
                            )
                          )
                          (if (i32.eq (local.get $b2) (i32.const 0x72))
                            (then
                              (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end)))
                                (then
                                  (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                                  (local.set $need_more (i32.const 1)) (br $outer_done)
                                )
                              )
                              (i32.store16 (local.get $op) (i32.const 0x6e5c))
                              (local.set $op (i32.add (local.get $op) (i32.const 2)))
                              (local.set $line (i32.add (local.get $line) (i32.const 1)))
                              (if (i32.and
                                    (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                                    (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x6e5c))
                                  )
                                (then (local.set $p (i32.add (local.get $p) (i32.const 4))))
                                (else (local.set $p (i32.add (local.get $p) (i32.const 2))))
                              )
                              (br $q_tail)
                            )
                          )
                          (if (i32.eq (local.get $b2) (i32.const 0x6e))
                            (then
                              (i32.store16 (local.get $op) (i32.const 0x6e5c))
                              (local.set $op (i32.add (local.get $op) (i32.const 2)))
                              (local.set $p (i32.add (local.get $p) (i32.const 2)))
                              (local.set $line (i32.add (local.get $line) (i32.const 1)))
                              (br $q_tail)
                            )
                          )
                          (if (i32.or (i32.eq (local.get $b2) (i32.const 0x75)) (i32.eq (local.get $b2) (i32.const 0x2f)))
                            (then (i32.store (i32.const 552) (i32.const -1)) (return))
                          )
                          (i32.store8 (local.get $op) (i32.const 0x5c))
                          (i32.store8 (i32.add (local.get $op) (i32.const 1)) (local.get $b2))
                          (local.set $op (i32.add (local.get $op) (i32.const 2)))
                          (local.set $p (i32.add (local.get $p) (i32.const 2)))
                          (br $q_tail)
                        )
                      )
                    )
                  )

                  ;; If not closed and not hit_case_end, we hit chunk boundary -> rewind record!
                  (if (i32.and (i32.eqz (local.get $closed)) (i32.eqz (local.get $hit_case_end)))
                    (then
                      (if (local.get $is_eof) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                      (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                      (local.set $need_more (i32.const 1)) (br $outer_done)
                    )
                  )

                  ;; Unterminated quote at true case end ($hit_case_end == 1 && !$closed)
                  (if (i32.eqz (local.get $closed))
                    (then
                      (local.set $eop (call $rec_err (local.get $eop) (i32.const 2) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                      (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                      (local.set $op (local.get $field_data_start))
                      (i32.store16 (local.get $op) (i32.const 0x225c))
                      (local.set $op (i32.add (local.get $op) (i32.const 2)))
                      (local.set $p (i32.add (local.get $open) (i32.const 2)))
                      (local.set $line (local.get $open_line))
                      (local.set $hit_case_end (i32.const 0))
                      (br $enter_unquoted)
                    )
                  )

                  ;; Closed quote: check delimiter right after
                  (if (i32.ge_u (local.get $p) (local.get $src_end))
                    (then
                      (if (local.get $is_eof) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                      (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                      (local.set $need_more (i32.const 1)) (br $outer_done)
                    )
                  )
                  (local.set $b (i32.load8_u (local.get $p)))
                  (if (i32.eq (local.get $b) (i32.const 0x22))
                    (then
                      (i32.store8 (local.get $op) (i32.const 0x22))
                      (local.set $op (i32.add (local.get $op) (i32.const 1)))
                      (local.set $hit_case_end (i32.const 1))
                      (br $field_done)
                    )
                  )
                  (if (i32.eq (local.get $b) (i32.const 0x2c))
                    (then
                      (if (i32.and
                            (i32.eqz (local.get $is_row0))
                            (i32.and
                              (i32.lt_u (local.get $flen) (i32.const 16384))
                              (i32.and
                                (i32.le_u (i32.add (local.get $p) (i32.const 3)) (local.get $src_end))
                                (i32.ne (i32.load16_u (i32.add (local.get $p) (i32.const 1))) (i32.const 0x225c))
                              )
                            )
                          )
                        (then
                          (i32.store (local.get $op) (i32.const 0x00222c22))
                          (i32.store
                            (i32.add (global.get $fs_base) (i32.shl (local.get $flen) (i32.const 2)))
                            (i32.add (local.get $op) (i32.const 2))
                          )
                          (local.set $flen (i32.add (local.get $flen) (i32.const 1)))
                          (local.set $op (i32.add (local.get $op) (i32.const 3)))
                          (local.set $p (i32.add (local.get $p) (i32.const 1)))
                          (local.set $junk_mode (i32.const 0))
                          (local.set $junk_added (i32.const 0))
                          (br $enter_unquoted)
                        )
                      )
                      (i32.store8 (local.get $op) (i32.const 0x22))
                      (local.set $op (i32.add (local.get $op) (i32.const 1)))
                      (local.set $p (i32.add (local.get $p) (i32.const 1)))
                      (br $field_loop)
                    )
                  )
                  (if (i32.eq (local.get $b) (i32.const 0x5c))
                    (then
                      (if (i32.ge_u (i32.add (local.get $p) (i32.const 1)) (local.get $src_end))
                        (then
                          (if (local.get $is_eof) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                          (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                          (local.set $need_more (i32.const 1)) (br $outer_done)
                        )
                      )
                      (local.set $b2 (i32.load8_u (i32.add (local.get $p) (i32.const 1))))
                      (if (i32.eq (local.get $b2) (i32.const 0x6e))
                        (then
                          (i32.store8 (local.get $op) (i32.const 0x22))
                          (local.set $op (i32.add (local.get $op) (i32.const 1)))
                          (local.set $p (i32.add (local.get $p) (i32.const 2)))
                          (local.set $line (i32.add (local.get $line) (i32.const 1)))
                          (br $field_done)
                        )
                      )
                      (if (i32.eq (local.get $b2) (i32.const 0x72))
                        (then
                          (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end)))
                            (then
                              (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                              (local.set $need_more (i32.const 1)) (br $outer_done)
                            )
                          )
                          (if (i32.and
                                (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                                (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x6e5c))
                              )
                            (then
                              (i32.store8 (local.get $op) (i32.const 0x22))
                              (local.set $op (i32.add (local.get $op) (i32.const 1)))
                              (local.set $p (i32.add (local.get $p) (i32.const 4)))
                              (local.set $line (i32.add (local.get $line) (i32.const 1)))
                              (br $field_done)
                            )
                          )
                        )
                      )
                    )
                  )
                  ;; Post-quote junk tail
                  (local.set $junk_mode (i32.const 1))
                )
              )
            )

            ;; Unquoted SIMD loop: stop on 0x2c (,), 0x5c (\), OR 0x22 (")
            (block $u_simd_done
              (loop $u_simd
                (br_if $u_simd_done (i32.gt_u (i32.add (local.get $p) (i32.const 16)) (local.get $src_end)))
                (if (i32.and (local.get $is_row0) (i32.gt_u (i32.add (local.get $op) (i32.const 32)) (local.get $buf_limit)))
                  (then (i32.store (i32.const 552) (i32.const -1)) (return))
                )
                (local.set $v (v128.load (local.get $p)))
                (v128.store (local.get $op) (local.get $v))
                (local.set $mask
                  (i8x16.bitmask
                    (v128.or
                      (v128.or
                        (i8x16.eq (local.get $v) (local.get $splat_comma))
                        (i8x16.eq (local.get $v) (local.get $splat_bs))
                      )
                      (i8x16.eq (local.get $v) (local.get $splat_quote))
                    )
                  )
                )
                (if (i32.eqz (local.get $mask))
                  (then
                    (local.set $p (i32.add (local.get $p) (i32.const 16)))
                    (local.set $op (i32.add (local.get $op) (i32.const 16)))
                    (local.set $junk_added (i32.const 1))
                    (br $u_simd)
                  )
                )
                (local.set $tz (i32.ctz (local.get $mask)))
                (local.set $p (i32.add (local.get $p) (local.get $tz)))
                (local.set $op (i32.add (local.get $op) (local.get $tz)))
                (if (i32.gt_u (local.get $tz) (i32.const 0))
                  (then (local.set $junk_added (i32.const 1)))
                )

                (local.set $b (i32.load8_u (local.get $p)))
                (if (i32.eq (local.get $b) (i32.const 0x22))
                  (then
                    (local.set $hit_case_end (i32.const 1))
                    (br $u_simd_done)
                  )
                )
                (if (i32.eq (local.get $b) (i32.const 0x2c))
                  (then
                    (if (i32.and (local.get $junk_mode) (local.get $junk_added))
                      (then
                        (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                        (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                      )
                    )
                    (if (i32.and
                          (i32.eqz (local.get $junk_mode))
                          (i32.and
                            (i32.lt_u (local.get $flen) (i32.const 16384))
                            (i32.and
                              (i32.le_u (i32.add (local.get $p) (i32.const 3)) (local.get $src_end))
                              (i32.ne (i32.load16_u (i32.add (local.get $p) (i32.const 1))) (i32.const 0x225c))
                            )
                          )
                        )
                      (then
                        (i32.store (local.get $op) (i32.const 0x00222c22))
                        (i32.store
                          (i32.add (global.get $fs_base) (i32.shl (local.get $flen) (i32.const 2)))
                          (i32.add (local.get $op) (i32.const 2))
                        )
                        (local.set $flen (i32.add (local.get $flen) (i32.const 1)))
                        (local.set $op (i32.add (local.get $op) (i32.const 3)))
                        (local.set $p (i32.add (local.get $p) (i32.const 1)))
                        (br $u_simd)
                      )
                    )
                    (i32.store8 (local.get $op) (i32.const 0x22))
                    (local.set $op (i32.add (local.get $op) (i32.const 1)))
                    (local.set $p (i32.add (local.get $p) (i32.const 1)))
                    (br $field_loop)
                  )
                )

                ;; $b == 0x5c
                (if (i32.ge_u (i32.add (local.get $p) (i32.const 1)) (local.get $src_end))
                  (then (br $u_simd_done))
                )
                (local.set $b2 (i32.load8_u (i32.add (local.get $p) (i32.const 1))))
                (if (i32.eq (local.get $b2) (i32.const 0x6e))
                  (then
                    (if (i32.and (local.get $junk_mode) (local.get $junk_added))
                      (then
                        (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                        (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                      )
                    )
                    (i32.store8 (local.get $op) (i32.const 0x22))
                    (local.set $op (i32.add (local.get $op) (i32.const 1)))
                    (local.set $p (i32.add (local.get $p) (i32.const 2)))
                    (local.set $line (i32.add (local.get $line) (i32.const 1)))
                    (br $field_done)
                  )
                )
                (if (i32.eq (local.get $b2) (i32.const 0x72))
                  (then
                    (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end)))
                      (then
                        (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                        (local.set $need_more (i32.const 1)) (br $outer_done)
                      )
                    )
                    (if (i32.and
                          (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                          (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x6e5c))
                        )
                      (then
                        (if (i32.and (local.get $junk_mode) (local.get $junk_added))
                          (then
                            (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                            (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                          )
                        )
                        (i32.store8 (local.get $op) (i32.const 0x22))
                        (local.set $op (i32.add (local.get $op) (i32.const 1)))
                        (local.set $p (i32.add (local.get $p) (i32.const 4)))
                        (local.set $line (i32.add (local.get $line) (i32.const 1)))
                        (br $field_done)
                      )
                    )
                    (local.set $eop (call $rec_err (local.get $eop) (i32.const 0) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                    (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                    (local.set $p (i32.add (local.get $p) (i32.const 2)))
                    (br $u_simd)
                  )
                )
                (if (i32.or (i32.eq (local.get $b2) (i32.const 0x75)) (i32.eq (local.get $b2) (i32.const 0x2f)))
                  (then (i32.store (i32.const 552) (i32.const -1)) (return))
                )
                (i32.store8 (local.get $op) (i32.const 0x5c))
                (i32.store8 (i32.add (local.get $op) (i32.const 1)) (local.get $b2))
                (local.set $op (i32.add (local.get $op) (i32.const 2)))
                (local.set $p (i32.add (local.get $p) (i32.const 2)))
                (local.set $junk_added (i32.const 1))
                (br $u_simd)
              )
            )

            ;; Unquoted scalar tail
            (if (i32.eqz (local.get $hit_case_end))
              (then
                (block $u_tail_done
                  (loop $u_tail
                    (br_if $u_tail_done (i32.ge_u (local.get $p) (local.get $src_end)))
                    (if (i32.gt_u (i32.add (local.get $op) (i32.const 16)) (local.get $buf_limit))
                      (then
                        (if (local.get $is_row0) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                        (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                        (local.set $need_more (i32.const 1)) (br $outer_done)
                      )
                    )
                    (local.set $b (i32.load8_u (local.get $p)))
                    (if (i32.eq (local.get $b) (i32.const 0x22))
                      (then (local.set $hit_case_end (i32.const 1)) (br $u_tail_done))
                    )
                    (if (i32.eq (local.get $b) (i32.const 0x2c))
                      (then
                        (if (i32.and (local.get $junk_mode) (local.get $junk_added))
                          (then
                            (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                            (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                          )
                        )
                        (if (i32.and
                              (i32.eqz (local.get $junk_mode))
                              (i32.and
                                (i32.lt_u (local.get $flen) (i32.const 16384))
                                (i32.and
                                  (i32.le_u (i32.add (local.get $p) (i32.const 3)) (local.get $src_end))
                                  (i32.ne (i32.load16_u (i32.add (local.get $p) (i32.const 1))) (i32.const 0x225c))
                                )
                              )
                            )
                          (then
                            (i32.store (local.get $op) (i32.const 0x00222c22))
                            (i32.store
                              (i32.add (global.get $fs_base) (i32.shl (local.get $flen) (i32.const 2)))
                              (i32.add (local.get $op) (i32.const 2))
                            )
                            (local.set $flen (i32.add (local.get $flen) (i32.const 1)))
                            (local.set $op (i32.add (local.get $op) (i32.const 3)))
                            (local.set $p (i32.add (local.get $p) (i32.const 1)))
                            (br $u_tail)
                          )
                        )
                        (i32.store8 (local.get $op) (i32.const 0x22))
                        (local.set $op (i32.add (local.get $op) (i32.const 1)))
                        (local.set $p (i32.add (local.get $p) (i32.const 1)))
                        (br $field_loop)
                      )
                    )
                    (if (i32.eq (local.get $b) (i32.const 0x5c))
                      (then
                        (if (i32.ge_u (i32.add (local.get $p) (i32.const 1)) (local.get $src_end))
                          (then (br $u_tail_done))
                        )
                        (local.set $b2 (i32.load8_u (i32.add (local.get $p) (i32.const 1))))
                        (if (i32.eq (local.get $b2) (i32.const 0x6e))
                          (then
                            (if (i32.and (local.get $junk_mode) (local.get $junk_added))
                              (then
                                (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                                (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                              )
                            )
                            (i32.store8 (local.get $op) (i32.const 0x22))
                            (local.set $op (i32.add (local.get $op) (i32.const 1)))
                            (local.set $p (i32.add (local.get $p) (i32.const 2)))
                            (local.set $line (i32.add (local.get $line) (i32.const 1)))
                            (br $field_done)
                          )
                        )
                        (if (i32.eq (local.get $b2) (i32.const 0x72))
                          (then
                            (if (i32.and (i32.eqz (local.get $is_eof)) (i32.gt_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end)))
                              (then
                                (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                                (local.set $need_more (i32.const 1)) (br $outer_done)
                              )
                            )
                            (if (i32.and
                                  (i32.le_u (i32.add (local.get $p) (i32.const 4)) (local.get $src_end))
                                  (i32.eq (i32.load16_u (i32.add (local.get $p) (i32.const 2))) (i32.const 0x6e5c))
                                )
                              (then
                                (if (i32.and (local.get $junk_mode) (local.get $junk_added))
                                  (then
                                    (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                                    (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                                  )
                                )
                                (i32.store8 (local.get $op) (i32.const 0x22))
                                (local.set $op (i32.add (local.get $op) (i32.const 1)))
                                (local.set $p (i32.add (local.get $p) (i32.const 4)))
                                (local.set $line (i32.add (local.get $line) (i32.const 1)))
                                (br $field_done)
                              )
                            )
                            (local.set $eop (call $rec_err (local.get $eop) (i32.const 0) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                            (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                            (local.set $p (i32.add (local.get $p) (i32.const 2)))
                            (br $u_tail)
                          )
                        )
                        (if (i32.or (i32.eq (local.get $b2) (i32.const 0x75)) (i32.eq (local.get $b2) (i32.const 0x2f)))
                          (then (i32.store (i32.const 552) (i32.const -1)) (return))
                        )
                        (i32.store8 (local.get $op) (i32.const 0x5c))
                        (i32.store8 (i32.add (local.get $op) (i32.const 1)) (local.get $b2))
                        (local.set $op (i32.add (local.get $op) (i32.const 2)))
                        (local.set $p (i32.add (local.get $p) (i32.const 2)))
                        (local.set $junk_added (i32.const 1))
                        (br $u_tail)
                      )
                    )
                    (i32.store8 (local.get $op) (local.get $b))
                    (local.set $op (i32.add (local.get $op) (i32.const 1)))
                    (local.set $p (i32.add (local.get $p) (i32.const 1)))
                    (local.set $junk_added (i32.const 1))
                    (br $u_tail)
                  )
                )
              )
            )

            ;; If neither hit_case_end nor terminated field -> hit chunk end -> rewind record!
            (if (i32.eqz (local.get $hit_case_end))
              (then
                (if (local.get $is_eof) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                (local.set $need_more (i32.const 1)) (br $outer_done)
              )
            )

            ;; Hit case end at unquoted / tail
            (if (i32.and (local.get $junk_mode) (local.get $junk_added))
              (then
                (local.set $eop (call $rec_err (local.get $eop) (i32.const 1) (local.get $record_line) (local.get $record_row) (i32.const 0) (i32.const 0)))
                (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
              )
            )
            (i32.store8 (local.get $op) (i32.const 0x22))
            (local.set $op (i32.add (local.get $op) (i32.const 1)))
          )
        )

        ;; Verify if hit_case_end: ensure we have >= 18 bytes after $p to read ,"header":true/false}}
        (if (i32.and (local.get $hit_case_end) (i32.gt_u (i32.add (local.get $p) (i32.const 18)) (local.get $src_end)))
          (then
            ;; Rewind this last record if not EOF so next chunk has the full ,"header":...
            (if (i32.eqz (local.get $is_eof))
              (then
                (local.set $p (local.get $record_start_p)) (local.set $op (local.get $row_start_op)) (local.set $eop (local.get $row_start_eop)) (local.set $extra_op (local.get $row_start_extra)) (local.set $line (local.get $record_line))
                (local.set $need_more (i32.const 1)) (local.set $hit_case_end (i32.const 0)) (br $outer_done)
              )
            )
          )
        )

        ;; Check empty stray-CR-only unquoted line
        (local.set $empty_row_op
          (if (result i32) (local.get $is_row0)
            (then (i32.add (global.get $row0_base) (i32.const 3)))
            (else (i32.add (local.get $row_start_op) (if (result i32) (i32.gt_s (local.get $row_count) (i32.const 0)) (then (i32.const 4)) (else (i32.const 3)))))
          )
        )
        (if (i32.and
              (i32.eq (local.get $flen) (i32.const 1))
              (i32.and (i32.eqz (local.get $first_quoted)) (i32.eq (local.get $op) (local.get $empty_row_op)))
            )
          (then
            (local.set $op (local.get $row_start_op))
            (br_if $outer_done (local.get $hit_case_end))
            (br $outer)
          )
        )

        (if (i32.lt_s (local.get $width) (i32.const 0))
          (then (local.set $width (local.get $flen)))
        )

        (if (local.get $is_row0)
          (then
            (i32.store8 (local.get $op) (i32.const 0x5d))
            (local.set $op (i32.sub (i32.add (local.get $op) (i32.const 1)) (global.get $row0_base)))
            (i32.store (i32.const 544) (local.get $op))
            (local.set $op (i32.add (local.get $row_start_op) (i32.add (i32.const 26) (local.get $op))))
            (local.set $columns_done (i32.const 1))
            (br_if $outer_done (local.get $hit_case_end))
            (br $outer)
          )
        )

        (if (i32.lt_s (local.get $flen) (local.get $width))
          (then
            (local.set $eop (call $rec_err (local.get $eop) (i32.const 3) (local.get $record_line) (local.get $record_row) (local.get $flen) (i32.const 0)))
            (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
            (if (i32.gt_u (i32.add (local.get $op) (i32.add (i32.mul (i32.sub (local.get $width) (local.get $flen)) (i32.const 3)) (i32.const 16))) (global.get $out_limit))
              (then (i32.store (i32.const 552) (i32.const -1)) (return))
            )
            (local.set $k (local.get $flen))
            (loop $pad
              (i32.store8 (local.get $op) (i32.const 0x2c))
              (i32.store16 (i32.add (local.get $op) (i32.const 1)) (i32.const 0x2222))
              (local.set $op (i32.add (local.get $op) (i32.const 3)))
              (local.set $k (i32.add (local.get $k) (i32.const 1)))
              (br_if $pad (i32.lt_s (local.get $k) (local.get $width)))
            )
            (i32.store8 (local.get $op) (i32.const 0x5d))
            (local.set $op (i32.add (local.get $op) (i32.const 1)))
          )
          (else
            (if (i32.gt_s (local.get $flen) (local.get $width))
              (then
                (local.set $cut_start
                  (i32.load (i32.add (global.get $fs_base) (i32.shl (local.get $width) (i32.const 2))))
                )
                (local.set $slice_len (i32.sub (local.get $op) (local.get $cut_start)))
                (if (i32.gt_u (i32.add (local.get $extra_op) (local.get $slice_len)) (global.get $extra_limit))
                  (then (i32.store (i32.const 552) (i32.const -1)) (return))
                )
                (memory.copy (local.get $extra_op) (local.get $cut_start) (local.get $slice_len))
                (local.set $eop (call $rec_err (local.get $eop) (i32.const 4) (local.get $record_line) (local.get $record_row) (local.get $extra_op) (local.get $slice_len)))
                (if (i32.lt_s (local.get $eop) (i32.const 0)) (then (i32.store (i32.const 552) (i32.const -1)) (return)))
                (local.set $extra_op (i32.add (local.get $extra_op) (local.get $slice_len)))
                (local.set $op (i32.sub (local.get $cut_start) (i32.const 1)))
                (i32.store8 (local.get $op) (i32.const 0x5d))
                (local.set $op (i32.add (local.get $op) (i32.const 1)))
              )
              (else
                (i32.store8 (local.get $op) (i32.const 0x5d))
                (local.set $op (i32.add (local.get $op) (i32.const 1)))
              )
            )
          )
        )
        (local.set $row_count (i32.add (local.get $row_count) (i32.const 1)))
        (br_if $outer_done (local.get $hit_case_end))
        (br $outer)
      )
    )

    ;; Save state
    (i32.store (i32.const 512) (local.get $p))
    (i32.store (i32.const 516) (local.get $op))
    (i32.store (i32.const 520) (local.get $line))
    (i32.store (i32.const 524) (local.get $width))
    (i32.store (i32.const 528) (local.get $columns_done))
    (i32.store (i32.const 532) (local.get $row_count))
    (i32.store (i32.const 536) (local.get $eop))
    (i32.store (i32.const 540) (local.get $extra_op))

    (if (local.get $hit_case_end)
      (then
        ;; Ensure ,"header":true}} / false}} fits in chunk
        (if (i32.and (i32.eq (i32.load8_u (i32.add (local.get $p) (i32.const 11))) (i32.const 0x74))
                     (i32.le_u (i32.add (local.get $p) (i32.const 17)) (local.get $src_end)))
          (then
            (i32.store (i32.const 512) (i32.add (local.get $p) (i32.const 17)))
            (i32.store (i32.const 556) (i32.const 1))
            (i32.store (i32.const 552) (i32.const 1))
            (return)
          )
        )
        (if (i32.and (i32.eq (i32.load8_u (i32.add (local.get $p) (i32.const 11))) (i32.const 0x66))
                     (i32.le_u (i32.add (local.get $p) (i32.const 18)) (local.get $src_end)))
          (then
            (i32.store (i32.const 512) (i32.add (local.get $p) (i32.const 18)))
            (i32.store (i32.const 556) (i32.const 0))
            (i32.store (i32.const 552) (i32.const 1))
            (return)
          )
        )
        (i32.store (i32.const 552) (i32.const -1))
        (return)
      )
    )
    (i32.store (i32.const 552) (i32.const 0))
  )
)
