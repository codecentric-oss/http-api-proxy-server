import { requestToId } from './proxy-server'
import { ResponseCacheConnector } from './response-cache'
import { IncomingMessage as Req } from 'http'

describe('ResponseCacheConnector', () => {
  const req0415987281 = { url: '/graphql?mock' } as Req
  //const reqOther = { url: '/graphql?test' } as Req
  const cache = new ResponseCacheConnector(
    ['test', 'responses', 'testName'],
    requestToId,
  )

  test('filePathForHash will build valid path', () => {
    expect(cache.filePathForRequestId('hash')).toEqual(
      'test/responses/testName/hash.json',
    )
  })

  test('filePathForRequest will build valid path', () => {
    expect(cache.filePathForRequest(req0415987281)).toEqual(
      'test/responses/testName/responseFor0415987281.json',
    )
  })
})
