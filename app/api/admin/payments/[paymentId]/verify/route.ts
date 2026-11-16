export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;
  return Response.json(
    {
      message: "Verify/approve/reject society payment endpoint not yet implemented",
      paymentId,
    },
    { status: 501 }
  );
}

