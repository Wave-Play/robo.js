import { EmbedParser, DateFormatParser, DenyParser, RequiredParser } from '@tagscript/plugin-discord'
import {
	DefineParser,
	BreakParser,
	FiftyFiftyParser,
	Interpreter,
	IntersectionStatementParser,
	IfStatementParser,
	JSONVarParser,
	IncludesParser,
	RandomParser,
	RangeParser,
	ReplaceParser,
	StopParser,
	SliceParser,
	StringFormatParser,
	UnionStatementParser
} from 'tagscript'

export const dbNameSpace = (c?: string) => `__tagbot__${c ?? ''}`

export const tagScriptIntrepreter = new Interpreter(
	new BreakParser(),
	new IntersectionStatementParser(),
	new IfStatementParser(),
	new DefineParser(),
	new UnionStatementParser(),
	new FiftyFiftyParser(),
	new StringFormatParser(),
	new IncludesParser(),
	new JSONVarParser(),
	new RandomParser(),
	new ReplaceParser(),
	new SliceParser(),
	new RangeParser(),
	new StopParser(),
	new DenyParser(),
	new RequiredParser(),
	new EmbedParser(),
	new DateFormatParser()
)
