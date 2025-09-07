import { bench, run, do_not_optimize } from 'mitata'

import {
  red, blue, bold, underline, italic,
  composeColors, createColors, hex
} from '../dist/core/color.js'

const SIZES = [16, 64, 256, 1024, 4096]
const make = (n: number) => 'x'.repeat(n)

const fRed = red
const fCombo3 = composeColors(bold, red, underline)
const fCombo5 = composeColors(bold, red, underline, italic, blue)
const fHexValid = hex('#33cc99')
const fHexInvalid = hex('nope')

const disabled = createColors({ useColor: false })

bench('red.apply(size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => do_not_optimize(fRed(str))
})
.args('n', SIZES)
.gc('inner')

bench('compose(3).apply(size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => do_not_optimize(fCombo3(str))
})
.args('n', SIZES)
.gc('inner')

bench('compose(5).apply(size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => do_not_optimize(fCombo5(str))
})
.args('n', SIZES)
.gc('inner')

bench('compose(3)+apply(size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => {
    const f = composeColors(bold, red, underline)
    do_not_optimize(f(str))
  }
})
.args('n', SIZES)
.gc('inner')

bench('hex.create(valid)', () => do_not_optimize(hex('#33cc99'))).gc('once')
bench('hex.create(invalid)', () => do_not_optimize(hex('not-a-hex'))).gc('once')

bench('hex.apply(valid,size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => do_not_optimize(fHexValid(str))
})
.args('n', SIZES)
.gc('inner')

bench('hex.apply(invalid,size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => do_not_optimize(fHexInvalid(str))
})
.args('n', SIZES)
.gc('inner')

bench('disabled.red(size=$n)', function* (s) {
  const n = s.get('n')
  const str = make(n)
  yield () => do_not_optimize(disabled.red(str))
})
.args('n', SIZES)
.gc('inner')

bench('createColors(useColor=true)', () => do_not_optimize(createColors({ useColor: true }))).gc('inner')
bench('createColors(useColor=false)', () => do_not_optimize(createColors({ useColor: false }))).gc('inner')

await run()
