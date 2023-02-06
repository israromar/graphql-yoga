import { memoize2of4 } from '@graphql-tools/utils'
import type { DocumentNode, parse, validate } from 'graphql'
import LRU from 'lru-cache'
import type { Plugin } from './types.js'

// eslint-disable-next-line @typescript-eslint/ban-types
export function useParserAndValidationCache(): Plugin<{}> {
  const parserResultCache = new LRU<string, DocumentNode>({
    max: 1024,
  })
  const parserErrorCache = new LRU<string, Error>({
    max: 1024,
  })
  const memoizedValidateByRules = new LRU<string, typeof validate>({
    max: 1024,
  })
  return {
    onParse({
      parseFn,
      setParseFn,
    }: {
      parseFn: typeof parse
      setParseFn: (fn: typeof parse) => void
    }) {
      setParseFn(function memoizedParse(source) {
        const strDocument = typeof source === 'string' ? source : source.body
        let document = parserResultCache.get(strDocument)
        if (!document) {
          const parserError = parserErrorCache.get(strDocument)
          if (parserError) {
            throw parserError
          }
          try {
            document = parseFn(source)
          } catch (e) {
            parserErrorCache.set(strDocument, e as Error)
            throw e
          }
          parserResultCache.set(strDocument, document)
        }
        return document
      })
    },
    onValidate({
      validateFn,
      setValidationFn,
    }: {
      validateFn: typeof validate
      setValidationFn: (fn: typeof validate) => void
    }) {
      setValidationFn(function memoizedValidateFn(schema, document, rules) {
        const rulesKey = rules?.map((rule) => rule.name).join(',') || ''
        let memoizedValidateFnForRules = memoizedValidateByRules.get(rulesKey)
        if (!memoizedValidateFnForRules) {
          memoizedValidateFnForRules = memoize2of4(validateFn)
          memoizedValidateByRules.set(rulesKey, memoizedValidateFnForRules)
        }
        return memoizedValidateFnForRules(schema, document, rules)
      })
    },
  }
}
