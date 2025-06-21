import { expect } from 'chai'
import { Model } from 'nextbone'
import sinon from 'sinon'
import { FireCollection } from '../src/collection.js'
import {
  initializeDataset,
  clearDataset,
  collectionName,
  collectionData,
} from './helpers/dataset.js'

/**
 * @import {Firestore, DocumentReference, CollectionReference, Query, FirestoreDataConverter} from 'firebase/firestore'
 */

import { getDb, createCollectionRef } from './helpers/firebase.js'

import {
  collection as createCollection,
  query,
  where,
  orderBy,
  addDoc,
  getDocs,
  CollectionReference,
  Query,
  deleteField,
  doc,
  updateDoc,
} from 'firebase/firestore'

const { match, spy, stub } = sinon

describe('FireCollection', () => {
  /**
   * @type {Firestore}
   */
  let db

  before(async () => {
    db = await getDb()
  })

  it('should allow to define initial models as options.models', () => {
    const collection = new FireCollection({
      models: [{ a: 'b' }, { x: 'y' }],
    })
    expect(collection.length).to.be.equal(2)
    expect(collection.at(0).get('a')).to.be.equal('b')
  })

  it('should pass options to Collection', () => {
    class MyModel extends Model {}
    const collection = new FireCollection({
      model: MyModel,
      comparator: 'test',
    })
    collection.add({ x: 'x' })
    expect(collection.at(0)).to.be.instanceOf(MyModel)
    expect(collection.comparator).to.be.equal('test')
  })

  describe('ref', () => {
    it('should return undefined by default', () => {
      const model = new FireCollection()
      expect(model.ref()).to.be.undefined
    })

    it('should return the declared ref', () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, 'collectionPath')
        }
      }
      const collection = new TestCollection()
      const ref = collection.ref()
      expect(ref).to.be.instanceOf(CollectionReference)
      expect(ref.path).to.equal('collectionPath')
    })
  })

  describe('path', () => {
    it('should return undefined by default', () => {
      const model = new FireCollection()
      expect(model.path()).to.be.undefined
    })

    it('should return the path of the query', () => {
      class TestCollection extends FireCollection {
        static getDb() {
          return db
        }

        path() {
          return 'collectionPath'
        }
      }
      const collection = new TestCollection()
      const query = collection.getQuery()
      expect(query).to.be.instanceOf(CollectionReference)
      expect(query.path).to.equal('collectionPath')
    })

    it('should apply the defined converter to the query', () => {
      /**
       * @type {FirestoreDataConverter}
       */
      const converter = {
        fromFirestore(snapshot) {},
      }
      class TestCollection extends FireCollection {
        static getDb() {
          return db
        }

        static converter = converter

        path() {
          return 'collectionPath'
        }
      }
      const collection = new TestCollection()
      const query = collection.getQuery()
      expect(query.converter).to.equal(converter)
    })
  })

  describe('updateRef', () => {
    it('should call ref and return its result', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, 'collectionPath')
        }
      }
      const collection = new TestCollection()
      const refSpy = spy(collection, 'ref')
      const ref = await collection.updateRef()
      expect(ref.path).to.equal('collectionPath')
      expect(refSpy).to.be.calledOnce
    })

    it('should call query with return from ref', async () => {
      const ref = createCollection(db, 'collectionPath')
      class TestCollection extends FireCollection {
        query(ref) {
          return query(ref, orderBy('name'))
        }
      }
      const collection = new TestCollection()
      stub(collection, 'ref').returns(ref)
      const querySpy = spy(collection, 'query')
      const resolvedRef = await collection.updateRef()
      expect(querySpy).to.be.calledOnce.and.be.calledWith(ref)
      expect(resolvedRef).to.be.instanceOf(Query)
    })

    it('should not call query when ref returns undefined', async () => {
      class TestCollection extends FireCollection {
        query(ref) {
          return query(ref, orderBy('name'))
        }
      }
      const collection = new TestCollection()
      const querySpy = spy(collection, 'query')
      await collection.updateRef()
      expect(querySpy).to.not.be.called
    })

    it('should call ref only once when called in same microtask', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, 'collectionPath')
        }
      }
      const collection = new TestCollection()
      const refSpy = spy(collection, 'ref')
      collection.updateRef()
      await collection.updateRef()
      expect(refSpy).to.be.calledOnce
    })
  })

  describe('params', () => {
    it('should return an empty object by default', () => {
      class TestCollection extends FireCollection {}

      const collection = new TestCollection()
      expect(collection.params).to.deep.equal({})
    })

    it('should call updateRef when setting to a new object', () => {
      class TestCollection extends FireCollection {}

      const collection = new TestCollection()
      const updateRefSpy = spy(collection, 'updateRef')
      collection.params = { test: 'x' }

      expect(updateRefSpy).to.be.calledOnce
    })

    it('should call updateRef when changing one of its properties', () => {
      class TestCollection extends FireCollection {}

      const collection = new TestCollection()
      const updateRefSpy = spy(collection, 'updateRef')

      collection.params.test = 'x'

      expect(updateRefSpy).to.be.calledOnce
    })

    it('should be passed to ref and query as a param', async () => {
      const ref = createCollection(db, 'collectionPath')
      class TestCollection extends FireCollection {}

      const collection = new TestCollection()
      const refSpy = stub(collection, 'ref').returns(ref)
      const querySpy = spy(collection, 'query')

      collection.params.test = 'x'

      await collection.ready()

      expect(refSpy).to.be.calledWith(collection.params)
      expect(querySpy).to.be.calledWith(ref, collection.params)
    })
  })

  describe('observe', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('should start observing for changes in collection', async () => {
      const ref = createCollectionRef(db)
      class TestCollection extends FireCollection {
        ref() {
          return ref
        }
      }

      const collection = new TestCollection()
      collection.observe()
      expect(collection.isObserved).to.be.equal(true)
      addDoc(ref, { x: 'y' })
      return new Promise((resolve) => {
        collection.once('add', (model) => {
          expect(model.get('x')).to.equal('y')
          expect(collection.length).to.be.equal(1)
          collection.unobserve()
          resolve()
        })
      })
    })

    it('should set isLoading and trigger request', async () => {
      const ref = createCollectionRef(db)
      class TestCollection extends FireCollection {
        ref() {
          return ref
        }
      }

      const collection = new TestCollection()
      const requestSpy = spy()
      collection.on('request', requestSpy)
      collection.observe()
      expect(collection.isLoading).to.be.equal(true)
      expect(requestSpy).to.be.calledOnce
    })

    it('should trigger load after observe', async () => {
      const ref = createCollectionRef(db)
      class TestCollection extends FireCollection {
        ref() {
          return ref
        }
      }

      const collection = new TestCollection()
      const loadSpy = spy()
      collection.on('load', loadSpy)
      collection.observe()
      await collection.ready()
      expect(collection.isLoading).to.be.equal(false)
      expect(loadSpy).to.be.calledOnce
    })

    it('should trigger load after standalone fetch', async () => {
      const ref = createCollectionRef(db)
      class TestCollection extends FireCollection {
        ref() {
          return ref
        }
      }

      const collection = new TestCollection()
      const loadSpy = spy()
      collection.on('load', loadSpy)
      await collection.ready()
      expect(collection.isLoading).to.be.equal(false)
      expect(loadSpy).to.be.calledOnce
    })

    it('should call parse', async () => {
      class TestCollection extends FireCollection {
        query(ref) {
          return query(ref, orderBy('count'))
        }

        ref() {
          return createCollection(db, collectionName)
        }
      }
      const collection = new TestCollection()
      const parseSpy = spy(collection, 'parse')
      collection.observe()
      return new Promise((resolve) => {
        collection.once('sync', () => {
          expect(parseSpy).to.be.calledOnce.and.be.calledWithMatch(
            collectionData.map((item) => match(item))
          )
          resolve()
        })
      })
    })

    it('should remove attribute when deleted in database', async () => {
      const ref = createCollectionRef(db)
      class TestCollection extends FireCollection {
        ref() {
          return ref
        }
      }
      const collection = new TestCollection()
      collection.observe()
      addDoc(ref, { x: 'y' })
      await new Promise((resolve) => {
        collection.once('add', resolve)
      })
      const model = collection.at(0)
      expect(model.get('x')).to.be.equal('y')
      updateDoc(doc(ref, model.id), { x: deleteField() })
      await new Promise((resolve) => {
        collection.once('update', resolve)
      })
      expect(model.get('x')).to.be.undefined
    })
  })

  describe('unobserve', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('should stop observing for changes in collection', async () => {
      let callCount = 0
      const ref = createCollectionRef(db)
      class TestCollection extends FireCollection {
        ref() {
          return ref
        }
      }

      const collection = new TestCollection()
      collection.observe()
      addDoc(ref, { x: 'y' })
      return new Promise((resolve) => {
        collection.on('add', () => {
          callCount++
          if (callCount > 1) {
            throw new Error('add event should not be called after unobserve')
          } else {
            collection.unobserve()
            expect(collection.isObserved).to.be.equal(false)
            addDoc(ref, { a: 'b' }).then(() => {
              setTimeout(resolve, 100)
            })
          }
        })
      })
    })
  })

  describe('ready', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('when ref is undefined should resolve to empty data and not call reset/update', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return undefined
        }
      }

      const resetSpy = spy()
      const collection = new TestCollection()
      collection.on('update reset', resetSpy)
      await collection.ready()
      expect(collection.length).to.be.equal(0)
      expect(resetSpy).to.not.be.called
    })

    it('when not observing should fetch data and resolves when data loaded', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, collectionName)
        }
      }

      const collection = new TestCollection()
      await collection.ready()
      expect(collection.length).to.be.equal(collectionData.length)
    })

    it('when not observing and ref is updated should refetch data', async () => {
      class TestCollection extends FireCollection {
        countParam = 1

        ref() {
          return createCollection(db, collectionName)
        }

        query(ref) {
          return query(ref, where('count', '==', this.countParam))
        }
      }

      const collection = new TestCollection()
      await collection.ready()
      expect(collection.at(0).get('count')).to.be.equal(1)
      collection.countParam = 2
      collection.updateRef()
      await collection.ready()
      expect(collection.at(0).get('count')).to.be.equal(2)
    })

    it('when not observing and ref is updated to undefined should resolve to empty data', async () => {
      class TestCollection extends FireCollection {
        countParam = 1

        ref() {
          return createCollection(db, collectionName)
        }

        query(ref) {
          if (this.countParam) {
            return query(ref, where('count', '==', this.countParam))
          }
          return undefined
        }
      }

      const resetSpy = spy()
      const removeSpy = spy()
      const updateSpy = spy()
      const collection = new TestCollection()
      await collection.ready()
      expect(collection.at(0).get('count')).to.be.equal(1)
      collection.countParam = null
      collection.on('reset', resetSpy)
      collection.on('remove', removeSpy)
      collection.on('update', updateSpy)
      collection.updateRef()
      await collection.ready()
      expect(collection.length).to.be.equal(0)
      expect(resetSpy).to.not.be.called
      expect(removeSpy).to.be.called
      expect(updateSpy).to.be.called
    })

    it('when observing should resolve when data loaded', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, collectionName)
        }
      }

      const collection = new TestCollection()
      collection.observe()
      await collection.ready()
      expect(collection.length).to.be.equal(collectionData.length)
    })

    it('when observing and ref is updated should resolve with updated data', async () => {
      class TestCollection extends FireCollection {
        countParam = 1

        ref() {
          return createCollection(db, collectionName)
        }

        query(ref) {
          return query(ref, where('count', '==', this.countParam))
        }
      }

      const collection = new TestCollection()
      collection.observe()
      await collection.ready()
      expect(collection.at(0).get('count')).to.be.equal(1)
      collection.countParam = 2
      collection.updateRef()
      await collection.ready()
      expect(collection.at(0).get('count')).to.be.equal(2)
    })

    it('when observing and ref is updated to undefined should resolve with empty data', async () => {
      class TestCollection extends FireCollection {
        countParam = 1

        ref() {
          return createCollection(db, collectionName)
        }

        query(ref) {
          if (this.countParam) {
            return query(ref, where('count', '==', this.countParam))
          }
          return undefined
        }
      }

      const collection = new TestCollection()
      collection.observe()
      await collection.ready()
      expect(collection.at(0).get('count')).to.be.equal(1)
      collection.countParam = null
      collection.updateRef()
      await collection.ready()
      expect(collection.length).to.be.equal(0)
    })
  })

  describe('sync', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('should get docs when fetching a collection', async () => {
      const collectionRef = createCollection(db, collectionName)
      class TestCollection extends FireCollection {
        query(ref) {
          return query(ref, orderBy('count'))
        }

        ref() {
          return collectionRef
        }
      }
      const collection = new TestCollection()
      await collection.fetch()
      const responseData = collection.map((model) => model.omit('id'))

      expect(responseData).to.be.eql(collectionData)
    })

    it('should call parse when fetching a collection', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return query(createCollection(db, collectionName), orderBy('count'))
        }
      }
      const collection = new TestCollection()
      const parseSpy = spy(collection, 'parse')
      await collection.fetch()
      expect(parseSpy).to.be.calledOnce.and.be.calledWithMatch(
        collectionData.map((item) => match(item))
      )
    })
  })

  describe('beforeSync', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('should be called before parse when calling fetch', async () => {
      const beforeSyncSpy = spy()
      const parseSpy = spy()
      class TestCollection extends FireCollection {
        ref() {
          return query(createCollection(db, collectionName), orderBy('count'))
        }

        async beforeSync() {
          await new Promise((resolve) => {
            setTimeout(resolve, 50)
          })
          beforeSyncSpy()
        }

        parse() {
          parseSpy()
        }
      }
      const collection = new TestCollection()
      await collection.fetch()

      expect(beforeSyncSpy).to.be.calledOnce
      expect(parseSpy).to.be.calledOnce
      expect(beforeSyncSpy).to.be.calledBefore(parseSpy)
    })

    it('should be called before parse when calling ready', async () => {
      const beforeSyncSpy = spy()
      const parseSpy = spy()
      class TestCollection extends FireCollection {
        ref() {
          return query(createCollection(db, collectionName), orderBy('count'))
        }

        async beforeSync() {
          await new Promise((resolve) => {
            setTimeout(resolve, 50)
          })
          beforeSyncSpy()
        }

        parse() {
          parseSpy()
        }
      }
      const collection = new TestCollection()
      await collection.ready()

      expect(beforeSyncSpy).to.be.calledOnce
      expect(parseSpy).to.be.calledOnce
      expect(beforeSyncSpy).to.be.calledBefore(parseSpy)
    })

    it('should be called before parse when calling observe', async () => {
      const beforeSyncSpy = spy()
      const parseSpy = spy()
      class TestCollection extends FireCollection {
        ref() {
          return query(createCollection(db, collectionName), orderBy('count'))
        }

        async beforeSync() {
          await new Promise((resolve) => {
            setTimeout(resolve, 50)
          })
          beforeSyncSpy()
        }

        parse() {
          parseSpy()
        }
      }
      const collection = new TestCollection()
      collection.observe()
      await collection.ready()

      expect(beforeSyncSpy).to.be.calledOnce
      expect(parseSpy).to.be.calledOnce
      expect(beforeSyncSpy).to.be.calledBefore(parseSpy)
    })
  })

  describe('addDocument', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('should add a new document', async () => {
      const collectionRef = createCollectionRef(db)

      class TestCollection extends FireCollection {
        ref() {
          return collectionRef
        }
      }
      const collection = new TestCollection()

      await collection.addDocument({ foo: 'bar' })
      const snapshot = await getDocs(collectionRef)
      expect(snapshot.docs.length).to.be.equal(1)
      expect(snapshot.docs[0].data()).to.be.eql({ foo: 'bar' })
    })

    it('should not call ref if already computed', async () => {
      const collectionRef = createCollectionRef(db)
      const refSpy = sinon.spy()

      class TestCollection extends FireCollection {
        ref() {
          refSpy()
          return collectionRef
        }
      }
      const collection = new TestCollection()
      collection.ensureRef()
      expect(refSpy).to.be.calledOnce
      await collection.addDocument({ foo: 'bar' })
      expect(refSpy).to.be.calledOnce
    })
  })

  describe('error handling', () => {
    before(async () => {
      await initializeDataset()
    })

    after(async () => {
      await clearDataset()
    })

    it('should emit error event when sync fails', async () => {
      const collectionRef = createCollection(db, collectionName)
      class TestCollection extends FireCollection {
        ref() {
          return collectionRef
        }

        async sync() {
          throw new Error('Test error')
        }
      }
      const collection = new TestCollection()

      const errorPromise = new Promise((resolve) => {
        collection.once('error', (error) => {
          expect(error).to.be.instanceOf(Error)
          expect(error.message).to.equal('Test error')
          resolve()
        })
      })

      await collection.fetch()
      await errorPromise
    })

    it('should emit error event when ref fails', async () => {
      class TestCollection extends FireCollection {
        ref() {
          throw new Error('Ref error')
        }
      }
      const collection = new TestCollection()

      const errorPromise = new Promise((resolve) => {
        collection.once('error', (error) => {
          expect(error).to.be.instanceOf(Error)
          expect(error.message).to.equal('Ref error')
          resolve()
        })
      })

      collection.fetch()
      await errorPromise
    })

    it('should emit error event when query failts', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, collectionName)
        }

        query() {
          throw new Error('Query error')
        }
      }
      const collection = new TestCollection()

      const errorPromise = new Promise((resolve) => {
        collection.once('error', (error) => {
          expect(error).to.be.instanceOf(Error)
          expect(error.message).to.equal('Query error')
          resolve()
        })
      })

      collection.fetch()
      await errorPromise
    })

    it('should emit error event when parse fails', async () => {
      class TestCollection extends FireCollection {
        ref() {
          return createCollection(db, collectionName)
        }

        parse() {
          throw new Error('Parse error')
        }
      }
      const collection = new TestCollection()

      const errorPromise = new Promise((resolve) => {
        collection.once('error', (error) => {
          expect(error).to.be.instanceOf(Error)
          expect(error.message).to.equal('Parse error')
          resolve()
        })
      })

      collection.fetch()
      await errorPromise
    })

    it('should emit error event when beforeSync fails', async () => {
      const collectionRef = createCollection(db, collectionName)
      class TestCollection extends FireCollection {
        ref() {
          return collectionRef
        }

        async beforeSync() {
          throw new Error('beforeSync error')
        }
      }
      const collection = new TestCollection()

      const errorPromise = new Promise((resolve) => {
        collection.once('error', (error) => {
          expect(error).to.be.instanceOf(Error)
          expect(error.message).to.equal('beforeSync error')
          resolve()
        })
      })

      collection.fetchInitialData()
      await errorPromise
    })
  })
})
