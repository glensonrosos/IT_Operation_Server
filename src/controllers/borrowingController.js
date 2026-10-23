import { AppError } from '../middleware/errorHandler.js';
import { cancelBorrowing, checkinBorrowing, checkoutBorrowing, createBorrowing, decideBorrowing, getBorrowing, listBorrowings, markBorrowingReady } from '../services/borrowingService.js';
import { borrowingCheckinSchema, borrowingCheckoutSchema, borrowingDecisionSchema, borrowingQuerySchema, borrowingReadySchema, createBorrowingSchema } from '../validators/borrowingValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getBorrowings(req, res, next) {
  const filters = parseOrFail(borrowingQuerySchema, req.query, next);
  if (!filters) return;
  try {
    const data = await listBorrowings(filters, req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getBorrowingById(req, res, next) {
  try {
    const borrowing = await getBorrowing(req.params.id, req.user);
    res.json({ success: true, data: { borrowing } });
  } catch (error) {
    next(error);
  }
}

export async function postBorrowing(req, res, next) {
  const input = parseOrFail(createBorrowingSchema, req.body, next);
  if (!input) return;
  try {
    const borrowing = await createBorrowing(input, req.user._id);
    res.status(201).json({ success: true, message: 'Borrowing request created', data: { borrowing } });
  } catch (error) {
    next(error);
  }
}

export async function postBorrowingDecision(req, res, next) {
  const input = parseOrFail(borrowingDecisionSchema, req.body, next);
  if (!input) return;
  try {
    const borrowing = await decideBorrowing(req.params.id, input, req.user._id);
    res.json({ success: true, message: `Borrowing ${input.decision.toLowerCase()}`, data: { borrowing } });
  } catch (error) {
    next(error);
  }
}

export async function postBorrowingReady(req, res, next) {
  const input = parseOrFail(borrowingReadySchema, req.body, next);
  if (!input) return;
  try {
    const borrowing = await markBorrowingReady(req.params.id, input, req.user._id);
    res.json({ success: true, message: 'Borrowing prepared for release', data: { borrowing } });
  } catch (error) {
    next(error);
  }
}

export async function postBorrowingCheckout(req, res, next) {
  const input = parseOrFail(borrowingCheckoutSchema, req.body, next);
  if (!input) return;
  try {
    const borrowing = await checkoutBorrowing(req.params.id, input, req.user._id);
    res.json({ success: true, message: 'Equipment checked out', data: { borrowing } });
  } catch (error) {
    next(error);
  }
}

export async function postBorrowingCheckin(req, res, next) {
  const input = parseOrFail(borrowingCheckinSchema, req.body, next);
  if (!input) return;
  try {
    const borrowing = await checkinBorrowing(req.params.id, input, req.user._id);
    res.json({ success: true, message: 'Borrowing items checked in', data: { borrowing } });
  } catch (error) {
    next(error);
  }
}

export async function postBorrowingCancel(req, res, next) {
  try {
    const borrowing = await cancelBorrowing(req.params.id, req.user);
    res.json({ success: true, message: 'Borrowing request cancelled', data: { borrowing } });
  } catch (error) {
    next(error);
  }
}
